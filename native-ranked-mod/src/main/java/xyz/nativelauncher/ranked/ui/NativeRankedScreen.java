package xyz.nativelauncher.ranked.ui;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.LiteralText;
import xyz.nativelauncher.ranked.RankedController;

import java.util.ArrayList;
import java.util.List;

public final class NativeRankedScreen extends Screen {
    private final RankedController controller = RankedController.INSTANCE;
    private final List<NativeButton> buttons = new ArrayList<>();
    private NativeButton ranked;
    private NativeButton casual;
    private NativeButton cancel;
    private NativeButton vanilla;
    private String selectedMode = "ranked";
    private float entrance;

    public NativeRankedScreen() {
        super(new LiteralText("Native Ranked"));
    }

    @Override
    protected void init() {
        buttons.clear();
        boolean compact = compact();
        int contentX = compact ? 48 : Math.max(76, width / 2 - 350);
        int contentWidth = compact ? width - 60 : Math.min(700, width - contentX - 24);
        int heroWidth = compact ? contentWidth : Math.max(290, (int)(contentWidth * 0.61F));
        int heroY = compact ? 52 : 92;
        int buttonY = compact ? heroY + 92 : heroY + 128;
        ranked = add(new NativeButton("FIND RANKED MATCH", true, () -> controller.join("ranked"))
            .bounds(contentX + 18, buttonY, heroWidth - 36, compact ? 24 : 30));
        casual = add(new NativeButton("PRACTICE CASUAL", false, () -> controller.join("casual"))
            .bounds(contentX + 18, compact ? heroY + 121 : heroY + 164, heroWidth - 36, compact ? 21 : 26));
        cancel = add(new NativeButton("CANCEL SEARCH", false, controller::leaveQueue)
            .bounds(contentX + 18, buttonY, heroWidth - 36, compact ? 24 : 30));
        vanilla = add(new NativeButton("VANILLA MENU", false, () -> controller.allowVanillaTitle(client))
            .bounds(contentX, height - (compact ? 27 : 42), compact ? 92 : 110, compact ? 19 : 24));
    }

    private NativeButton add(NativeButton button) {
        buttons.add(button);
        return button;
    }

    @Override
    public void tick() {
        if (entrance < 1F) entrance += (1F - entrance) * 0.18F + 0.01F;
    }

    @Override
    public void render(MatrixStack matrices, int mouseX, int mouseY, float delta) {
        NativeDraw.gradient(matrices, 0, 0, width, height, NativeTheme.BACKGROUND, 0xFF090909);
        renderRail(matrices);

        boolean compact = compact();
        int contentX = compact ? 48 : Math.max(76, width / 2 - 350);
        int contentWidth = compact ? width - 60 : Math.min(700, width - contentX - 24);
        int heroWidth = compact ? contentWidth : Math.max(290, (int)(contentWidth * 0.61F));
        int sideX = contentX + heroWidth + 12;
        int sideWidth = contentWidth - heroWidth - 12;
        int offset = (int)((1F - smooth(entrance)) * (compact ? 7F : 16F));

        NativeDraw.text(matrices, textRenderer, "RANKED", contentX, (compact ? 15 : 30) + offset, NativeTheme.TEXT);
        NativeDraw.text(matrices, textRenderer, "Native competitive speedrunning", contentX, (compact ? 29 : 47) + offset, NativeTheme.MUTED);
        statusPill(matrices, contentX + contentWidth - 68, (compact ? 14 : 29) + offset);

        int heroY = (compact ? 52 : 92) + offset;
        NativeDraw.borderedRect(matrices, contentX, heroY, heroWidth, compact ? 152 : 214, 10, NativeTheme.BORDER, NativeTheme.SURFACE);
        NativeDraw.roundedRect(matrices, contentX + 18, heroY + (compact ? 10 : 18), 34, 18, 5, 0xFF262626);
        NativeDraw.centered(matrices, textRenderer, "1v1", contentX + 35, heroY + (compact ? 15 : 23), NativeTheme.ACCENT_BRIGHT);
        NativeDraw.text(matrices, textRenderer, "Same seed. Same start.", contentX + 18, heroY + (compact ? 34 : 52), NativeTheme.TEXT);
        NativeDraw.text(matrices, textRenderer, "First to defeat the Ender Dragon wins.", contentX + 18, heroY + (compact ? 49 : 69), NativeTheme.MUTED);

        if (!controller.configured()) {
            NativeDraw.text(matrices, textRenderer, NativeDraw.ellipsis(textRenderer, "Launch this instance from Native to connect your profile.", heroWidth - 36), contentX + 18, heroY + (compact ? 68 : 103), NativeTheme.RED);
        } else if (!controller.error().isEmpty()) {
            NativeDraw.text(matrices, textRenderer, NativeDraw.ellipsis(textRenderer, controller.error(), heroWidth - 36), contentX + 18, heroY + (compact ? 68 : 103), NativeTheme.RED);
        } else if ("queued".equals(controller.queueState())) {
            long elapsed = Math.max(0, (System.currentTimeMillis() - controller.queuedAt()) / 1000);
            NativeDraw.text(matrices, textRenderer, "Searching for a worthy opponent", contentX + 18, heroY + (compact ? 68 : 103), NativeTheme.ACCENT_BRIGHT);
            if (!compact) NativeDraw.text(matrices, textRenderer, "Queue  " + formatClock(elapsed), contentX + 18, heroY + 118, NativeTheme.MUTED);
        } else {
            String hint = compact ? controller.username() + "  ·  " + controller.rating() + " rating" : "Ranked adjusts your rating. Casual keeps it relaxed.";
            NativeDraw.text(matrices, textRenderer, NativeDraw.ellipsis(textRenderer, hint, heroWidth - 36), contentX + 18, heroY + (compact ? 68 : 103), NativeTheme.DIM);
        }

        boolean queued = "queued".equals(controller.queueState());
        ranked.enabled = controller.configured() && !controller.busy() && !queued;
        casual.enabled = ranked.enabled;
        cancel.enabled = !controller.busy();
        if (queued) cancel.render(matrices, textRenderer, mouseX, mouseY, delta);
        else {
            ranked.render(matrices, textRenderer, mouseX, mouseY, delta);
            casual.render(matrices, textRenderer, mouseX, mouseY, delta);
        }

        if (!compact) {
            renderProfile(matrices, sideX, heroY, sideWidth);
            renderLeaderboard(matrices, contentX, heroY + 226, contentWidth, Math.max(100, height - heroY - 284));
        }
        vanilla.render(matrices, textRenderer, mouseX, mouseY, delta);
        NativeDraw.text(matrices, textRenderer, "NATIVE RANKED  ·  BETA", contentX + contentWidth - 114, height - (compact ? 22 : 34), NativeTheme.DIM);
    }

    private void renderRail(MatrixStack matrices) {
        boolean compact = compact();
        int railWidth = compact ? 36 : 56;
        float logoX = compact ? 8 : 14;
        float logoSize = compact ? 20 : 28;
        NativeDraw.roundedRect(matrices, 0, 0, railWidth, height, 0, NativeTheme.RAIL);
        NativeDraw.roundedRect(matrices, logoX, compact ? 8 : 15, logoSize, logoSize, compact ? 6 : 8, NativeTheme.ACCENT);
        NativeDraw.centered(matrices, textRenderer, "N", railWidth / 2F, compact ? 14 : 25, 0xFF000000);
        NativeDraw.roundedRect(matrices, compact ? 6 : 10, compact ? 48 : 74, compact ? 24 : 36, compact ? 24 : 34, 8, 0xFF262626);
        NativeDraw.line(matrices, compact ? 12 : 20, compact ? 62 : 91, compact ? 18 : 27, compact ? 56 : 84, 2, NativeTheme.ACCENT_BRIGHT);
        NativeDraw.line(matrices, compact ? 18 : 27, compact ? 56 : 84, compact ? 25 : 36, compact ? 63 : 92, 2, NativeTheme.ACCENT_BRIGHT);
        NativeDraw.roundedRect(matrices, compact ? 10 : 20, height - (compact ? 26 : 34), 16, 16, 8, NativeTheme.SURFACE_HOVER);
        NativeDraw.centered(matrices, textRenderer, controller.username().substring(0, 1).toUpperCase(), railWidth / 2F, height - (compact ? 22 : 30), NativeTheme.TEXT);
    }

    private void statusPill(MatrixStack matrices, int x, int y) {
        int color = controller.online() ? NativeTheme.GREEN : NativeTheme.RED;
        NativeDraw.borderedRect(matrices, x, y, 68, 20, 10, NativeTheme.BORDER, NativeTheme.SURFACE);
        NativeDraw.roundedRect(matrices, x + 8, y + 7, 6, 6, 3, color);
        NativeDraw.text(matrices, textRenderer, controller.online() ? "ONLINE" : "OFFLINE", x + 19, y + 6, NativeTheme.MUTED);
    }

    private void renderProfile(MatrixStack matrices, int x, int y, int width) {
        if (width < 140) return;
        NativeDraw.borderedRect(matrices, x, y, width, 214, 10, NativeTheme.BORDER, NativeTheme.SURFACE);
        NativeDraw.roundedRect(matrices, x + 14, y + 16, 34, 34, 9, 0xFF262626);
        String initial = controller.username().isEmpty() ? "N" : controller.username().substring(0, 1).toUpperCase();
        NativeDraw.centered(matrices, textRenderer, initial, x + 31, y + 29, NativeTheme.ACCENT_BRIGHT);
        NativeDraw.text(matrices, textRenderer, NativeDraw.ellipsis(textRenderer, controller.username(), width - 66), x + 58, y + 19, NativeTheme.TEXT);
        NativeDraw.text(matrices, textRenderer, rankName(controller.rating()), x + 58, y + 34, NativeTheme.MUTED);
        NativeDraw.text(matrices, textRenderer, "RATING", x + 14, y + 73, NativeTheme.DIM);
        NativeDraw.text(matrices, textRenderer, Integer.toString(controller.rating()), x + 14, y + 88, NativeTheme.TEXT);
        NativeDraw.line(matrices, x + 14, y + 110, x + width - 14, y + 110, 1, NativeTheme.BORDER);
        stat(matrices, x + 14, y + 128, "WINS", controller.wins(), NativeTheme.GREEN);
        stat(matrices, x + width / 2, y + 128, "LOSSES", controller.losses(), NativeTheme.RED);
        int total = controller.wins() + controller.losses();
        int winRate = total == 0 ? 0 : Math.round(controller.wins() * 100F / total);
        NativeDraw.text(matrices, textRenderer, "WIN RATE", x + 14, y + 171, NativeTheme.DIM);
        NativeDraw.text(matrices, textRenderer, winRate + "%", x + 14, y + 187, NativeTheme.TEXT);
    }

    private void stat(MatrixStack matrices, int x, int y, String label, int value, int color) {
        NativeDraw.text(matrices, textRenderer, label, x, y, NativeTheme.DIM);
        NativeDraw.text(matrices, textRenderer, Integer.toString(value), x, y + 16, color);
    }

    private void renderLeaderboard(MatrixStack matrices, int x, int y, int width, int height) {
        NativeDraw.borderedRect(matrices, x, y, width, height, 10, NativeTheme.BORDER, NativeTheme.SURFACE);
        NativeDraw.text(matrices, textRenderer, "LEADERBOARD", x + 16, y + 14, NativeTheme.TEXT);
        NativeDraw.text(matrices, textRenderer, "TOP RACERS", x + width - 70, y + 14, NativeTheme.DIM);
        JsonArray players = controller.leaderboard();
        int rows = Math.min(players.size(), Math.max(0, (height - 43) / 19));
        for (int i = 0; i < rows; i++) {
            JsonElement element = players.get(i);
            if (!element.isJsonObject()) continue;
            JsonObject player = element.getAsJsonObject();
            int rowY = y + 38 + i * 19;
            if (i % 2 == 0) NativeDraw.roundedRect(matrices, x + 9, rowY - 4, width - 18, 17, 4, 0xFF15151D);
            NativeDraw.text(matrices, textRenderer, String.format("%02d", i + 1), x + 16, rowY, i < 3 ? NativeTheme.ACCENT_BRIGHT : NativeTheme.DIM);
            String name = RankedController.string(player, "username", "Player");
            NativeDraw.text(matrices, textRenderer, NativeDraw.ellipsis(textRenderer, name, width - 112), x + 44, rowY, NativeTheme.TEXT);
            String rating = Long.toString(RankedController.number(player, "rating", 1000));
            NativeDraw.text(matrices, textRenderer, rating, x + width - 18 - textRenderer.getWidth(rating), rowY, NativeTheme.MUTED);
        }
        if (rows == 0) NativeDraw.text(matrices, textRenderer, "No completed races yet. Be the first.", x + 16, y + 44, NativeTheme.MUTED);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0) {
            if ("queued".equals(controller.queueState())) {
                if (cancel.click(mouseX, mouseY)) return true;
            } else if (ranked.click(mouseX, mouseY) || casual.click(mouseX, mouseY)) return true;
            if (vanilla.click(mouseX, mouseY)) return true;
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean isPauseScreen() { return false; }

    private static String rankName(int rating) {
        if (rating >= 1800) return "Native Master";
        if (rating >= 1500) return "Diamond";
        if (rating >= 1250) return "Platinum";
        if (rating >= 1050) return "Gold";
        if (rating >= 850) return "Silver";
        return "Bronze";
    }

    private static String formatClock(long seconds) { return String.format("%02d:%02d", seconds / 60, seconds % 60); }
    private static float smooth(float t) { return t * t * (3F - 2F * t); }
    private boolean compact() { return width < 640 || height < 400; }
}
