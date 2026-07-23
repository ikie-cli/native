package xyz.nativelauncher.ranked;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The mod's own identity/config, stored at config/native-ranked.json. The mod
 * authenticates itself in-game (see {@link NativeAuth}) and persists the token
 * here — no launcher involvement required.
 */
public final class NativeConfig {
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
    private static final String DEFAULT_ENDPOINT = "https://api.nativelaunch.xyz";

    public String endpoint = DEFAULT_ENDPOINT;
    public String token = "";
    public String playerId = "";
    public String username = "Player";
    public boolean verified = false;
    public String deviceId = "";

    public static Path file() {
        return FabricLoader.getInstance().getConfigDir().resolve("native-ranked.json");
    }

    public static NativeConfig load() {
        NativeConfig config = new NativeConfig();
        Path file = file();
        if (Files.isRegularFile(file)) {
            try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                JsonObject json = GSON.fromJson(reader, JsonObject.class);
                if (json != null) {
                    config.endpoint = string(json, "endpoint", DEFAULT_ENDPOINT);
                    config.token = string(json, "token", "");
                    config.playerId = string(json, "playerId", "");
                    config.username = string(json, "username", "Player");
                    config.verified = json.has("verified") && !json.get("verified").isJsonNull() && json.get("verified").getAsBoolean();
                    config.deviceId = string(json, "deviceId", "");
                }
            } catch (IOException | RuntimeException ignored) {
                // Corrupt/unreadable config falls back to defaults + re-auth.
            }
        }
        config.endpoint = trimSlash(config.endpoint);
        return config;
    }

    public void save() {
        JsonObject json = new JsonObject();
        json.addProperty("endpoint", endpoint);
        json.addProperty("token", token);
        json.addProperty("playerId", playerId);
        json.addProperty("username", username);
        json.addProperty("verified", verified);
        json.addProperty("deviceId", deviceId);
        try {
            Files.createDirectories(file().getParent());
            try (Writer writer = Files.newBufferedWriter(file(), StandardCharsets.UTF_8)) {
                GSON.toJson(json, writer);
            }
        } catch (IOException ignored) {
            // Best-effort persistence; the in-memory token still works this session.
        }
    }

    public boolean isReady() {
        return !token.isEmpty() && !playerId.isEmpty();
    }

    private static String string(JsonObject object, String key, String fallback) {
        return object != null && object.has(key) && !object.get(key).isJsonNull() ? object.get(key).getAsString() : fallback;
    }

    private static String trimSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }
}
