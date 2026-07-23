package xyz.nativelauncher.ranked;

import com.google.gson.JsonObject;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.util.Session;

import java.security.SecureRandom;

/**
 * In-game self-authentication. Premium accounts are verified against Mojang via
 * the standard joinServer/hasJoined handshake (so the server can trust the
 * identity and unlock ranked); offline accounts fall back to an unverified
 * registration and are limited to casual by the server.
 */
public final class NativeAuth {
    private static final SecureRandom RANDOM = new SecureRandom();

    private NativeAuth() {}

    public static void authenticate(MinecraftClient client, NativeConfig config, RankedApi api) {
        Session session = client.getSession();
        String username = session.getUsername();

        // Premium path: prove account ownership through Mojang's session service.
        try {
            String serverId = randomHex(20);
            client.getSessionService().joinServer(session.getProfile(), session.getAccessToken(), serverId);
            JsonObject payload = new JsonObject();
            payload.addProperty("username", username);
            payload.addProperty("serverId", serverId);
            apply(config, api.post("/v1/auth/verify", payload), true);
            return;
        } catch (Exception premiumUnavailable) {
            // Offline / cracked / Mojang unreachable — fall through to casual identity.
        }

        // Offline path: a stable device-scoped identity, casual only.
        try {
            if (config.deviceId.isEmpty()) config.deviceId = randomHex(32);
            JsonObject payload = new JsonObject();
            payload.addProperty("profileId", session.getUuid());
            payload.addProperty("username", username);
            payload.addProperty("deviceId", config.deviceId);
            apply(config, api.post("/v1/auth/register", payload), false);
        } catch (Exception offlineFailed) {
            // Leave unauthenticated; the menu surfaces the error and offers retry.
        }
    }

    private static void apply(NativeConfig config, JsonObject response, boolean premium) {
        JsonObject player = RankedController.object(response, "player");
        config.token = RankedController.string(response, "token", "");
        if (player != null) {
            config.playerId = RankedController.string(player, "id", "");
            config.username = RankedController.string(player, "username", config.username);
            config.verified = premium || (player.has("verified") && !player.get("verified").isJsonNull() && player.get("verified").getAsBoolean());
        } else {
            config.verified = premium;
        }
        config.save();
    }

    private static String randomHex(int bytes) {
        byte[] buffer = new byte[bytes];
        RANDOM.nextBytes(buffer);
        StringBuilder sb = new StringBuilder(bytes * 2);
        for (byte b : buffer) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
