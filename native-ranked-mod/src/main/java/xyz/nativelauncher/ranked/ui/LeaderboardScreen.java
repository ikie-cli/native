package xyz.nativelauncher.ranked.ui;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.LiteralText;
import net.minecraft.util.math.MathHelper;
import xyz.nativelauncher.ranked.RankedController;

/** Dedicated global standings screen. Rows are clickable through to a profile. */
public final class LeaderboardScreen extends Screen {
    private static final int TOP = 108;
    private static final int ROW_H = 22;

    private final RankedController controller = RankedController.INSTANCE;
    private final Screen parent;
    private volatile JsonArray players;
    private NativeButton backButton;

    public LeaderboardScreen(Screen parent) {
        super(new LiteralText("Native Ranked Leaderboard"));
        this.parent = parent;
        this.players = controller.leaderboard();
    }

    @Override
    protected void init() {
        backButton = new NativeButton("\u2190  Back", false, () -> client.openScreen(parent)).bounds(margin(), height - 40, 104, 24);
        controller.fetchAsync("/v1/leaderboard?limit=50", res -> {
            if (res != null) players = RankedController.array(res, "players");
        });
    }

    private int margin() { return MathHelper.clamp(width / 8, 28, 96); }
    private int listBottom() { return height - 52; }
    private int visibleRows(int size) { return Math.min(size, Math.max(0, (listBottom() - TOP) / ROW_H)); }

    @Override
    public void render(MatrixStack matrices, int mouseX, int mouseY, float delta) {
        NativeDraw.gradient(matrices, 0, 0, width, height, 0xFF0B0B0E, 0xFF141418);
        int left = margin();
        int right = width - margin();

        NativeDraw.displayText(matrices, textRenderer, "LEADERBOARD", left, 38, NativeTheme.TEXT);
        NativeDraw.text(matrices, textRenderer, "SEASON ZERO  \u00b7  GLOBAL STANDINGS", left, 64, NativeTheme.MUTED);
        NativeDraw.line(matrices, left, 84, right, 84, 1F, NativeTheme.BORDER);

        NativeDraw.text(matrices, textRenderer, "#", left, 92, NativeTheme.DIM);
        NativeDraw.text(matrices, textRenderer, "PLAYER", left + 34, 92, NativeTheme.DIM);
        String wl = "W / L";
        NativeDraw.text(matrices, textRenderer, wl, right - 128, 92, NativeTheme.DIM);
        String rt = "RATING";
        NativeDraw.text(matrices, textRenderer, rt, right - NativeDraw.width(textRenderer, rt), 92, NativeTheme.DIM);

        JsonArray list = players;
        int rows = visibleRows(list.size());
        String me = controller.username();
        int y = TOP;
        for (int i = 0; i < rows; i++) {
            JsonElement el = list.get(i);
            if (el.isJsonObject()) renderRow(matrices, el.getAsJsonObject(), i, left, right, y, mouseX, mouseY, me);
            y += ROW_H;
        }
        if (list.size() == 0) {
            NativeDraw.centered(matrices, textRenderer, "No ranked races completed yet.", width / 2F, TOP + 24, NativeTheme.DIM);
        } else if (list.size() > rows) {
            NativeDraw.text(matrices, textRenderer, "+ " + (list.size() - rows) + " more", left, y + 4, NativeTheme.DIM);
        }

        if (backButton != null) backButton.render(matrices, textRenderer, mouseX, mouseY, delta);
        NativeDraw.text(matrices, textRenderer, "Click a player to view their profile", left + 124, height - 34, NativeTheme.DIM);
        super.render(matrices, mouseX, mouseY, delta);
    }

    private void renderRow(MatrixStack matrices, JsonObject p, int i, int left, int right, int y, int mouseX, int mouseY, String me) {
        String name = RankedController.string(p, "username", "Player");
        int rating = (int) RankedController.number(p, "rating", 1000);
        int wins = (int) RankedController.number(p, "wins", 0);
        int losses = (int) RankedController.number(p, "losses", 0);
        boolean self = name.equals(me);
        boolean hover = mouseX >= left - 8 && mouseX <= right + 8 && mouseY >= y - 2 && mouseY < y + ROW_H - 4;

        if (self) NativeDraw.roundedRect(matrices, left - 8, y - 3, right - left + 16, ROW_H - 3, 3, 0x22FFFFFF);
        else if (hover) NativeDraw.roundedRect(matrices, left - 8, y - 3, right - left + 16, ROW_H - 3, 3, 0x12FFFFFF);

        int rankColor = i == 0 ? 0xFFF4C97B : i == 1 ? 0xFFD5D5DB : i == 2 ? 0xFFC79768 : NativeTheme.DIM;
        NativeDraw.textBold(matrices, textRenderer, String.format("%02d", i + 1), left, y, rankColor);
        int nameColor = self || i < 3 ? NativeTheme.TEXT : NativeTheme.MUTED;
        NativeDraw.text(matrices, textRenderer, NativeDraw.ellipsis(textRenderer, name, right - left - 210), left + 34, y, nameColor);
        NativeDraw.text(matrices, textRenderer, wins + " / " + losses, right - 128, y, NativeTheme.MUTED);
        String r = Integer.toString(rating);
        NativeDraw.textBold(matrices, textRenderer, r, right - NativeDraw.widthBold(textRenderer, r), y, NativeTheme.TEXT);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (backButton != null && backButton.click(mouseX, mouseY)) return true;
        JsonArray list = players;
        int rows = visibleRows(list.size());
        int y = TOP;
        for (int i = 0; i < rows; i++) {
            if (mouseX >= margin() - 8 && mouseX <= width - margin() + 8 && mouseY >= y - 3 && mouseY < y + ROW_H - 3) {
                JsonElement el = list.get(i);
                if (el.isJsonObject()) {
                    String id = RankedController.string(el.getAsJsonObject(), "id", "");
                    if (!id.isEmpty()) {
                        client.openScreen(new ProfileScreen(this, id));
                        return true;
                    }
                }
            }
            y += ROW_H;
        }
        return super.mouseClicked(mouseX, mouseY, button);
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
