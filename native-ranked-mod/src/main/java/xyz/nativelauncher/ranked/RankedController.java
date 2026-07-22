package xyz.nativelauncher.ranked;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.screen.world.CreateWorldScreen;
import net.minecraft.client.gui.widget.TextFieldWidget;
import net.minecraft.item.Items;
import net.minecraft.world.World;
import xyz.nativelauncher.ranked.mixin.CreateWorldScreenAccessor;
import xyz.nativelauncher.ranked.mixin.MoreOptionsDialogAccessor;
import xyz.nativelauncher.ranked.ui.CountdownScreen;
import xyz.nativelauncher.ranked.ui.NativeRankedScreen;
import xyz.nativelauncher.ranked.ui.RaceResultScreen;

import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public final class RankedController {
    public static final RankedController INSTANCE = new RankedController();

    private final ExecutorService network = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "Native Ranked API");
        thread.setDaemon(true);
        return thread;
    });
    private final AtomicBoolean requestRunning = new AtomicBoolean();
    private NativeConfig config;
    private RankedApi api;
    private volatile JsonObject profile;
    private volatile JsonArray leaderboard = new JsonArray();
    private volatile JsonObject match;
    private volatile String queueState = "idle";
    private volatile long queuedAt;
    private volatile String error = "";
    private volatile boolean online;
    private volatile boolean busy;
    private long nextPoll;
    private boolean redirected;
    private boolean allowVanilla;
    private boolean worldRequested;
    private boolean readySent;
    private boolean raceStarted;
    private boolean resultShown;
    private boolean forfeitSent;
    private String sentProgress = "waiting";

    private RankedController() {}

    public void bootstrap(MinecraftClient client) {
        config = NativeConfig.load(client.runDirectory.toPath());
        api = new RankedApi(config);
        if (config.isReady()) refreshAll();
    }

    public void tick(MinecraftClient client) {
        if (config == null) bootstrap(client);
        if (client.world == null && client.currentScreen instanceof TitleScreen && !allowVanilla && !redirected) {
            redirected = true;
            client.openScreen(new NativeRankedScreen());
        }
        if (!(client.currentScreen instanceof TitleScreen)) redirected = false;

        long now = System.currentTimeMillis();
        if (config.isReady() && now >= nextPoll) {
            nextPoll = now + (match != null || "queued".equals(queueState) ? 900 : 5_000);
            poll();
        }

        JsonObject current = match;
        if (current == null) return;
        String status = string(current, "status", "");
        if ("preparing".equals(status) && client.world == null && !worldRequested) createRaceWorld(client, current);
        if (client.world != null && worldRequested && !readySent) {
            readySent = true;
            client.openScreen(new CountdownScreen());
            postMatch("ready", new JsonObject());
        }

        long startsAt = number(current, "startsAt", 0);
        if (client.world != null && "running".equals(status) && startsAt > 0) {
            if (now < startsAt && !(client.currentScreen instanceof CountdownScreen)) client.openScreen(new CountdownScreen());
            if (now >= startsAt && !raceStarted) {
                raceStarted = true;
                if (client.currentScreen instanceof CountdownScreen) client.openScreen(null);
            }
            if (raceStarted) detectProgress(client);
        }

        if (client.world == null && raceStarted && !"finished".equals(status) && !forfeitSent) {
            forfeitSent = true;
            postMatch("forfeit", new JsonObject());
        }
        if ("finished".equals(status) && !resultShown) {
            resultShown = true;
            client.openScreen(new RaceResultScreen());
            refreshAll();
        }
    }

    public void join(String mode) {
        if (!config.isReady() || busy) return;
        busy = true;
        JsonObject payload = new JsonObject();
        payload.addProperty("mode", mode);
        submit(() -> applyQueue(api.post("/v1/queue", payload)), true);
    }

    public void leaveQueue() {
        if (!config.isReady() || busy) return;
        busy = true;
        submit(() -> {
            api.delete("/v1/queue");
            queueState = "idle";
            queuedAt = 0;
        }, true);
    }

    public void finishRace() {
        JsonObject current = match;
        if (current == null || !raceStarted || "finished".equals(string(current, "status", ""))) return;
        postMatch("finish", new JsonObject());
    }

    public void reportProgress(String progress) {
        if (match == null || rank(progress) <= rank(sentProgress)) return;
        sentProgress = progress;
        JsonObject payload = new JsonObject();
        payload.addProperty("progress", progress);
        postMatch("progress", payload);
    }

    public void refreshAll() {
        if (!config.isReady()) return;
        submit(() -> {
            JsonObject response = api.get("/v1/profile");
            profile = object(response, "player");
            JsonObject board = api.get("/v1/leaderboard?limit=8");
            leaderboard = array(board, "players");
            online = true;
        }, false);
    }

    public void allowVanillaTitle(MinecraftClient client) {
        allowVanilla = true;
        client.openScreen(new TitleScreen());
    }

    public void returnHome(MinecraftClient client) {
        if (client.world != null) client.disconnect();
        resetRace();
        client.openScreen(new NativeRankedScreen());
    }

    public boolean configured() { return config != null && config.isReady(); }
    public boolean online() { return online; }
    public boolean busy() { return busy; }
    public String error() { return error; }
    public String queueState() { return queueState; }
    public long queuedAt() { return queuedAt; }
    public JsonObject profile() { return profile; }
    public JsonArray leaderboard() { return leaderboard; }
    public JsonObject match() { return match; }
    public boolean raceStarted() { return raceStarted; }

    public String username() {
        return profile == null ? (config == null ? "Player" : config.username) : string(profile, "username", config.username);
    }

    public int rating() { return profile == null ? 1000 : (int)number(profile, "rating", 1000); }
    public int wins() { return profile == null ? 0 : (int)number(profile, "wins", 0); }
    public int losses() { return profile == null ? 0 : (int)number(profile, "losses", 0); }

    public String opponentName() {
        JsonObject opponent = opponent();
        return opponent == null ? "Finding opponent" : string(opponent, "username", "Opponent");
    }

    public int opponentRating() {
        JsonObject opponent = opponent();
        return opponent == null ? 1000 : (int)number(opponent, "rating", 1000);
    }

    public String opponentProgress() {
        JsonObject opponent = opponent();
        return opponent == null ? "waiting" : string(opponent, "progress", "waiting");
    }

    public String ownProgress() {
        JsonObject self = self();
        return self == null ? sentProgress : string(self, "progress", sentProgress);
    }

    public long startsAt() { return match == null ? 0 : number(match, "startsAt", 0); }

    public boolean won() {
        return match != null && config != null && config.playerId.equals(string(match, "winnerId", ""));
    }

    public int ratingDelta() {
        JsonObject self = self();
        return self == null ? 0 : (int)number(self, "ratingDelta", 0);
    }

    public long finishMs() {
        JsonObject self = self();
        return self == null ? 0 : number(self, "finishMs", 0);
    }

    private void poll() {
        if (!requestRunning.compareAndSet(false, true)) return;
        network.execute(() -> {
            try {
                if (match != null) {
                    String id = string(match, "id", "");
                    JsonObject response = api.get("/v1/matches/" + id);
                    JsonObject updated = object(response, "match");
                    if (updated != null) match = updated;
                } else {
                    applyQueue(api.get("/v1/queue"));
                }
                online = true;
                error = "";
            } catch (Exception exception) {
                online = false;
                error = exception.getMessage() == null ? "Could not reach Native Ranked" : exception.getMessage();
            } finally {
                requestRunning.set(false);
            }
        });
    }

    private void postMatch(String action, JsonObject payload) {
        JsonObject current = match;
        if (current == null) return;
        String id = string(current, "id", "");
        submit(() -> {
            JsonObject response = api.post("/v1/matches/" + id + "/" + action, payload);
            JsonObject updated = object(response, "match");
            if (updated != null) match = updated;
        }, false);
    }

    private void submit(ThrowingRunnable task, boolean manageBusy) {
        network.execute(() -> {
            try {
                task.run();
                online = true;
                error = "";
            } catch (Exception exception) {
                online = false;
                error = exception.getMessage() == null ? "Native Ranked request failed" : exception.getMessage();
            } finally {
                if (manageBusy) busy = false;
            }
        });
    }

    private void applyQueue(JsonObject response) {
        queueState = string(response, "state", "idle");
        queuedAt = number(response, "joinedAt", queuedAt);
        JsonObject found = object(response, "match");
        if (found != null) {
            match = found;
            queueState = "matched";
        }
    }

    private void createRaceWorld(MinecraftClient client, JsonObject current) {
        worldRequested = true;
        CreateWorldScreen screen = new CreateWorldScreen(new NativeRankedScreen());
        client.openScreen(screen);
        CreateWorldScreenAccessor accessor = (CreateWorldScreenAccessor)screen;
        TextFieldWidget name = accessor.nativeRanked$getLevelNameField();
        if (name != null) name.setText("Native Race " + string(current, "id", "race").substring(0, 8));
        MoreOptionsDialogAccessor options = (MoreOptionsDialogAccessor)screen.moreOptionsDialog;
        if (options.nativeRanked$getSeedTextField() != null) {
            options.nativeRanked$getSeedTextField().setText(string(current, "seed", "0"));
        }
        accessor.nativeRanked$createLevel();
    }

    private void detectProgress(MinecraftClient client) {
        if (client.player == null || client.world == null) return;
        if (client.world.getRegistryKey() == World.END) {
            reportProgress("end");
            return;
        }
        if (has(client, Items.ENDER_EYE)) reportProgress("stronghold");
        else if (has(client, Items.BLAZE_ROD) || has(client, Items.BLAZE_POWDER)) reportProgress("fortress");
        else if (has(client, Items.ENDER_PEARL)) reportProgress("bastion");
        else if (client.world.getRegistryKey() == World.NETHER) reportProgress("nether");
        else reportProgress("overworld");
    }

    private static boolean has(MinecraftClient client, net.minecraft.item.Item item) {
        for (int i = 0; i < client.player.inventory.size(); i++) {
            if (client.player.inventory.getStack(i).getItem() == item) return true;
        }
        return false;
    }

    private JsonObject self() {
        if (match == null || config == null) return null;
        JsonArray players = array(match, "players");
        for (JsonElement element : players) {
            JsonObject player = element.getAsJsonObject();
            if (config.playerId.equals(string(player, "id", ""))) return player;
        }
        return null;
    }

    private JsonObject opponent() {
        if (match == null || config == null) return null;
        JsonArray players = array(match, "players");
        for (JsonElement element : players) {
            JsonObject player = element.getAsJsonObject();
            if (!config.playerId.equals(string(player, "id", ""))) return player;
        }
        return null;
    }

    private void resetRace() {
        match = null;
        queueState = "idle";
        queuedAt = 0;
        worldRequested = false;
        readySent = false;
        raceStarted = false;
        resultShown = false;
        forfeitSent = false;
        sentProgress = "waiting";
    }

    private static int rank(String progress) {
        String[] values = {"waiting", "overworld", "nether", "bastion", "fortress", "stronghold", "end", "finished"};
        for (int i = 0; i < values.length; i++) if (values[i].equals(progress.toLowerCase(Locale.ROOT))) return i;
        return -1;
    }

    public static String string(JsonObject object, String key, String fallback) {
        JsonElement value = object == null ? null : object.get(key);
        return value == null || value.isJsonNull() ? fallback : value.getAsString();
    }

    public static long number(JsonObject object, String key, long fallback) {
        JsonElement value = object == null ? null : object.get(key);
        return value == null || value.isJsonNull() ? fallback : value.getAsLong();
    }

    public static JsonObject object(JsonObject object, String key) {
        JsonElement value = object == null ? null : object.get(key);
        return value != null && value.isJsonObject() ? value.getAsJsonObject() : null;
    }

    public static JsonArray array(JsonObject object, String key) {
        JsonElement value = object == null ? null : object.get(key);
        return value != null && value.isJsonArray() ? value.getAsJsonArray() : new JsonArray();
    }

    private interface ThrowingRunnable { void run() throws Exception; }
}
