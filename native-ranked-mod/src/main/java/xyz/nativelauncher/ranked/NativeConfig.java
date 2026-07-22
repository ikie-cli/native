package xyz.nativelauncher.ranked;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.io.Reader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

public final class NativeConfig {
    private static final Gson GSON = new Gson();

    public final String endpoint;
    public final String token;
    public final String playerId;
    public final String username;

    private NativeConfig(String endpoint, String token, String playerId, String username) {
        this.endpoint = trimSlash(endpoint);
        this.token = token;
        this.playerId = playerId;
        this.username = username;
    }

    public static NativeConfig load(Path runDirectory) {
        Path file = runDirectory.resolve("native-ranked.json");
        if (!Files.isRegularFile(file)) {
            return new NativeConfig("http://80.225.195.237/ranked", "", "", "Player");
        }
        try (Reader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            JsonObject json = GSON.fromJson(reader, JsonObject.class);
            return new NativeConfig(
                string(json, "endpoint", "http://80.225.195.237/ranked"),
                string(json, "token", ""),
                string(json, "playerId", ""),
                string(json, "username", "Player")
            );
        } catch (IOException | RuntimeException ignored) {
            return new NativeConfig("http://80.225.195.237/ranked", "", "", "Player");
        }
    }

    public boolean isReady() {
        return !token.isEmpty() && !playerId.isEmpty();
    }

    private static String string(JsonObject object, String key, String fallback) {
        return object != null && object.has(key) ? object.get(key).getAsString() : fallback;
    }

    private static String trimSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }
}
