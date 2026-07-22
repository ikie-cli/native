package xyz.nativelauncher.ranked;

import com.google.gson.Gson;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class RankedApi {
    private static final Gson GSON = new Gson();
    private final NativeConfig config;

    public RankedApi(NativeConfig config) {
        this.config = config;
    }

    public JsonObject get(String path) throws IOException {
        return request("GET", path, null);
    }

    public JsonObject post(String path, JsonObject payload) throws IOException {
        return request("POST", path, payload == null ? new JsonObject() : payload);
    }

    public JsonObject delete(String path) throws IOException {
        return request("DELETE", path, null);
    }

    private JsonObject request(String method, String path, JsonObject payload) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(config.endpoint + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(5_000);
        connection.setReadTimeout(8_000);
        connection.setRequestProperty("Accept", "application/json");
        if (!config.token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + config.token);
        if (payload != null) {
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] bytes = GSON.toJson(payload).getBytes(StandardCharsets.UTF_8);
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(bytes);
            }
        }

        int status = connection.getResponseCode();
        InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        StringBuilder body = new StringBuilder();
        if (input != null) {
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
        }
        JsonElement parsed = body.length() == 0 ? new JsonObject() : GSON.fromJson(body.toString(), JsonElement.class);
        JsonObject result = parsed != null && parsed.isJsonObject() ? parsed.getAsJsonObject() : new JsonObject();
        if (status >= 400) {
            String message = result.has("error") ? result.get("error").getAsString() : "Native Ranked request failed (" + status + ")";
            throw new IOException(message);
        }
        return result;
    }
}
