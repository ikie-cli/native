package xyz.nativelauncher.ranked.ui;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.LiteralText;
import net.minecraft.util.math.MathHelper;
import xyz.nativelauncher.ranked.RankedController;

/** Public profile: tier, stats, and recent races for the local player or any opponent. */
public final class ProfileScreen extends Screen {
    private final RankedController controller = RankedController.INSTANCE;
    private final Screen parent;
    private final String playerId;
    private volatile JsonObject player;
    private volatile JsonArray history = new JsonArray();
    private volatile boolean loading = true;
    private volatile boolean failed = false;
    private NativeButton backButton;

    public ProfileScreen(Screen parent, String playerId) {
        super(new LiteralText("Native Ranked Profile"));
        this.parent = parent;
        this.playerId = playerId == null ? "" : playerId;
    }

    @Override
    protected void init() {
        backButton = new NativeButton("\u2190  Back", false, () -> client.openScreen(parent)).bounds(margin(), height - 40, 104, 24);
        if (playerId.isEmpty()) { loading = false; failed = true; return; }
        controller.fetchAsync("/v1/players/" + playerId, res -> {
            loading = false;
            JsonObject p = RankedController.object(res, "player");
            if (p == null) { failed = true; return; }
            player = p;
            history = RankedController.array(res, "history");
        });
    }

    private int margin() { return MathHelper.clamp(width / 8, 28, 96); }

    @Override
    public void render(MatrixStack matrices, int mouseX, int mouseY, float delta) {
        NativeDraw.gradient(matrices, 0, 0, width, height, 0xFF0B0B0E, 0xFF141418);
        int left = margin();
        int right = width - margin();

        if (loading) {
            NativeDraw.centered(matrices, textRenderer, "Loading profile\u2026", width / 2F, height / 2F - 4, NativeTheme.MUTED);
        } else if (failed || player == null) {
            NativeDraw.centered(matrices, textRenderer, "Profile unavailable.", width / 2F, height / 2F - 4, NativeTheme.RED);
        } else {
            renderProfile(matrices, left, right);
        }

        if (backButton != null) backButton.render(matrices, textRenderer, mouseX, mouseY, delta);
        super.render(matrices, mouseX, mouseY, delta);
    }

    private void renderProfile(MatrixStack matrices, int left, int right) {
        JsonObject p = player;
        String name = RankedController.string(p, "username", "Player");
        int rating = (int) RankedController.number(p, "rating", 1000);
        int wins = (int) RankedController.number(p, "wins", 0);
        int losses = (int) RankedController.number(p, "losses", 0);
        int races = wins + losses;
        boolean verified = p.has("verified") && !p.get("verified").isJsonNull() && p.get("verified").getAsBoolean();
        int winPct = races == 0 ? 0 : Math.round(wins * 100F / races);

        NativeDraw.displayText(matrices, textRenderer, NativeDraw.ellipsis(textRenderer, name, right - left - 120), left, 38, NativeTheme.TEXT);
        NativeDraw.text(matrices, textRenderer, Ranks.name(rating).toUpperCase() + "  \u00b7  " + rating + " RATING", left, 66, NativeTheme.MUTED);

        String tag = verified ? "PREMIUM" : "OFFLINE";
        int tagW = NativeDraw.width(textRenderer, tag) + 16;
        NativeDraw.borderedRect(matrices, right - tagW, 38, tagW, 17, 3, verified ? 0x664ADE80 : NativeTheme.BORDER, 0x18FFFFFF);
        NativeDraw.centered(matrices, textRenderer, tag, right - tagW / 2F, 43, verified ? NativeTheme.GREEN : NativeTheme.DIM);
        NativeDraw.line(matrices, left, 86, right, 86, 1F, NativeTheme.BORDER);

        int tileY = 100, tileH = 54, gap = 10;
        int tileW = (right - left - gap * 3) / 4;
        statTile(matrices, left, tileY, tileW, tileH, Integer.toString(rating), "RATING");
        statTile(matrices, left + (tileW + gap), tileY, tileW, tileH, Integer.toString(wins), "WINS");
        statTile(matrices, left + (tileW + gap) * 2, tileY, tileW, tileH, Integer.toString(losses), "LOSSES");
        statTile(matrices, left + (tileW + gap) * 3, tileY, tileW, tileH, winPct + "%", "WIN RATE");

        int recY = tileY + tileH + 24;
        NativeDraw.text(matrices, textRenderer, "RECENT RACES", left, recY - 14, NativeTheme.DIM);
        NativeDraw.line(matrices, left, recY - 3, right, recY - 3, 1F, 0x22FFFFFF);

        JsonArray h = history;
        int rowH = 20;
        int maxRows = Math.max(0, (height - 52 - recY) / rowH);
        int rows = Math.min(h.size(), maxRows);
        int y = recY + 4;
        for (int i = 0; i < rows; i++) {
            JsonElement el = h.get(i);
            if (el.isJsonObject()) renderRace(matrices, el.getAsJsonObject(), left, right, y);
            y += rowH;
        }
        if (h.size() == 0) NativeDraw.text(matrices, textRenderer, "No completed races yet.", left, recY + 6, NativeTheme.DIM);
    }

    private void statTile(MatrixStack m, int x, int y, int w, int h, String value, String label) {
        NativeDraw.borderedRect(m, x, y, w, h, 4, NativeTheme.BORDER, 0xFF121216);
        float scale = 1.8F;
        float vw = NativeDraw.widthBold(textRenderer, value) * scale;
        NativeDraw.scaledText(m, textRenderer, value, x + w / 2F - vw / 2F, y + 12, scale, NativeTheme.TEXT, true);
        NativeDraw.centered(m, textRenderer, label, x + w / 2F, y + h - 15, NativeTheme.DIM);
    }

    private void renderRace(MatrixStack m, JsonObject race, int left, int right, int y) {
        boolean win = RankedController.string(race, "winnerId", "").equals(playerId);
        String opp = RankedController.string(race, "opponent", "Unknown");
        int delta = (int) RankedController.number(race, "ratingDelta", 0);
        long finishMs = RankedController.number(race, "finishMs", 0);
        String mode = RankedController.string(race, "mode", "ranked");
        boolean casual = "casual".equals(mode);

        NativeDraw.textBold(m, textRenderer, win ? "WIN" : "LOSS", left, y, win ? NativeTheme.GREEN : NativeTheme.RED);
        NativeDraw.text(m, textRenderer, "vs " + NativeDraw.ellipsis(textRenderer, opp(opp), right - left - 240), left + 42, y, NativeTheme.MUTED);
        String time = finishMs > 0 ? clock(finishMs) : "DNF";
        NativeDraw.text(m, textRenderer, time, right - 168, y, NativeTheme.MUTED);
        NativeDraw.text(m, textRenderer, casual ? "CASUAL" : "RANKED", right - 96, y, NativeTheme.DIM);
        String d = casual ? "\u2014" : (delta >= 0 ? "+" + delta : Integer.toString(delta));
        int dc = casual ? NativeTheme.DIM : (delta >= 0 ? NativeTheme.GREEN : NativeTheme.RED);
        NativeDraw.textBold(m, textRenderer, d, right - NativeDraw.widthBold(textRenderer, d), y, dc);
    }

    private static String opp(String value) { return value == null || value.isEmpty() ? "Unknown" : value; }

    private static String clock(long ms) {
        long totalSeconds = ms / 1000;
        return String.format("%d:%02d.%03d", totalSeconds / 60, totalSeconds % 60, ms % 1000);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (keyCode == 256) { client.openScreen(parent); return true; }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean shouldCloseOnEsc() { return false; }

    @Override
    public boolean isPauseScreen() { return false; }
}
