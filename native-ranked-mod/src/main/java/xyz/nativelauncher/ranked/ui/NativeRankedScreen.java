package xyz.nativelauncher.ranked.ui;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.gui.RotatingCubeMapRenderer;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.TitleScreen;
import net.minecraft.client.gui.widget.ButtonWidget;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.LiteralText;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.MathHelper;
import xyz.nativelauncher.ranked.RankedController;

/**
 * Vanilla-styled title screen for the Native Ranked client: the real Minecraft
 * panorama background, stock {@link ButtonWidget}s stacked on the left, and the
 * real Native logo image on the right. All click/hover/sound handling is left to
 * the vanilla widget system.
 */
public final class NativeRankedScreen extends Screen {
    private static final Identifier PANORAMA_OVERLAY =
        new Identifier("textures/gui/title/background/panorama_overlay.png");
    private static final Identifier LOGO = new Identifier("native_ranked", "textures/gui/logo.png");

    private final RankedController controller = RankedController.INSTANCE;
    private final RotatingCubeMapRenderer panorama = new RotatingCubeMapRenderer(TitleScreen.PANORAMA_CUBE_MAP);

    private ButtonWidget rankedButton;
    private ButtonWidget casualButton;
    private ButtonWidget cancelButton;
    private float fade;

    public NativeRankedScreen() {
        super(new LiteralText("Native Ranked"));
    }

    @Override
    protected void init() {
        int left = leftMargin();
        int buttonWidth = buttonWidth();
        int baseY = height - 88;

        rankedButton = addButton(new ButtonWidget(left, baseY, buttonWidth, 20,
            new LiteralText("Find Ranked Match"), button -> controller.join("ranked")));
        casualButton = addButton(new ButtonWidget(left, baseY + 24, buttonWidth, 20,
            new LiteralText("Practice (Casual)"), button -> controller.join("casual")));
        cancelButton = addButton(new ButtonWidget(left, baseY, buttonWidth, 20,
            new LiteralText("Cancel Search"), button -> controller.leaveQueue()));

        updateButtons();
    }

    /** Keeps the vanilla buttons in sync with the controller state. */
    private void updateButtons() {
        if (rankedButton == null) return;
        boolean queued = "queued".equals(controller.queueState());
        boolean ready = controller.configured() && controller.online() && !controller.busy();

        rankedButton.visible = !queued;
        casualButton.visible = !queued;
        cancelButton.visible = queued;

        rankedButton.active = ready;
        casualButton.active = ready;
        cancelButton.active = !controller.busy();
    }

    @Override
    public void tick() {
        if (fade < 1F) fade = Math.min(1F, fade + 0.06F);
        updateButtons();
    }

    @Override
    public void render(MatrixStack matrices, int mouseX, int mouseY, float delta) {
        renderPanorama(matrices, delta);
        renderActionsColumn(matrices);
        renderBrandColumn(matrices);
        // Vanilla widget system draws (and later handles) the stock buttons.
        super.render(matrices, mouseX, mouseY, delta);
    }

    // ----- background -------------------------------------------------------

    private void renderPanorama(MatrixStack matrices, float delta) {
        panorama.render(delta, 1.0F);
        client.getTextureManager().bindTexture(PANORAMA_OVERLAY);
        RenderSystem.enableBlend();
        RenderSystem.blendFuncSeparate(
            GlStateManager.SrcFactor.SRC_ALPHA, GlStateManager.DstFactor.ONE_MINUS_SRC_ALPHA,
            GlStateManager.SrcFactor.ONE, GlStateManager.DstFactor.ZERO);
        RenderSystem.color4f(1F, 1F, 1F, 1F);
        drawTexture(matrices, 0, 0, this.width, this.height, 0.0F, 0.0F, 16, 128, 16, 128);
        RenderSystem.disableBlend();
        // A gentle bottom-up scrim keeps the left-hand buttons and status legible.
        fillGradient(matrices, 0, height - 150, width, height, 0x00000000, 0x88000000);
    }

    // ----- left column: status + vanilla buttons ---------------------------

    private void renderActionsColumn(MatrixStack matrices) {
        int left = leftMargin();
        boolean queued = "queued".equals(controller.queueState());
        int titleY = rankedButton != null ? rankedButton.y - 34 : height - 122;

        String title = queued ? "MATCHMAKING" : "PLAY NATIVE RANKED";
        textRenderer.drawWithShadow(matrices, title, left, titleY, NativeTheme.TEXT);

        String status;
        int statusColor = NativeTheme.MUTED;
        if (!controller.configured()) {
            status = "Open this client from the Native Launcher";
            statusColor = NativeTheme.RED;
        } else if (!controller.error().isEmpty()) {
            status = trim(controller.error(), buttonWidth());
            statusColor = NativeTheme.RED;
        } else if (queued) {
            long seconds = Math.max(0, (System.currentTimeMillis() - controller.queuedAt()) / 1000);
            status = "Searching for an opponent  \u00b7  " + clock(seconds);
        } else if (!controller.notice().isEmpty()) {
            status = trim(controller.notice(), buttonWidth());
            statusColor = NativeTheme.TEXT;
        } else {
            status = controller.username() + "  \u00b7  " + controller.rating() + " \u00b7 " + rankName(controller.rating());
        }
        textRenderer.drawWithShadow(matrices, status, left, titleY + 15, statusColor);
    }

    // ----- right column: real logo + profile + leaderboard ------------------

    private void renderBrandColumn(MatrixStack matrices) {
        int rightMargin = leftMargin();
        int panelWidth = MathHelper.clamp(width / 3, 152, 230);
        int panelX = width - rightMargin - panelWidth;
        int centerX = panelX + panelWidth / 2;

        int logoSize = MathHelper.clamp(Math.min(width, height) / 4, 72, 118);
        int logoTop = MathHelper.clamp(height / 8, 20, 54);
        int logoX = centerX - logoSize / 2;

        float alpha = MathHelper.clamp(fade, 0F, 1F);
        client.getTextureManager().bindTexture(LOGO);
        RenderSystem.enableBlend();
        RenderSystem.defaultBlendFunc();
        RenderSystem.color4f(1F, 1F, 1F, alpha);
        drawTexture(matrices, logoX, logoTop, logoSize, logoSize, 0.0F, 0.0F, 512, 512, 512, 512);
        RenderSystem.color4f(1F, 1F, 1F, 1F);

        int y = logoTop + logoSize + 8;
        drawCentered(matrices, "NATIVE RANKED", centerX, y, NativeTheme.TEXT);
        y += 18;

        // Your profile
        fill(matrices, panelX, y, panelX + panelWidth, y + 1, 0x33FFFFFF);
        y += 8;
        drawCentered(matrices, trim(controller.username(), panelWidth), centerX, y, NativeTheme.TEXT);
        y += 12;
        drawCentered(matrices,
            controller.rating() + " RATING  \u00b7  " + controller.wins() + "W " + controller.losses() + "L",
            centerX, y, NativeTheme.MUTED);
        y += 18;

        // Leaderboard
        fill(matrices, panelX, y, panelX + panelWidth, y + 1, 0x33FFFFFF);
        y += 8;
        drawCentered(matrices, "LEADERBOARD \u00b7 SEASON ZERO", centerX, y, NativeTheme.DIM);
        y += 15;

        JsonArray players = controller.leaderboard();
        int maxRows = Math.max(0, Math.min(5, (height - y - 26) / 13));
        int rows = Math.min(players.size(), maxRows);
        for (int i = 0; i < rows; i++) {
            JsonElement element = players.get(i);
            if (!element.isJsonObject()) continue;
            JsonObject player = element.getAsJsonObject();
            String name = RankedController.string(player, "username", "Player");
            String rating = Long.toString(RankedController.number(player, "rating", 1000));
            boolean self = name.equals(controller.username());
            if (self) fill(matrices, panelX - 2, y - 2, panelX + panelWidth + 2, y + 11, 0x22FFFFFF);
            int color = self ? NativeTheme.TEXT : (i < 3 ? NativeTheme.TEXT : NativeTheme.MUTED);
            textRenderer.drawWithShadow(matrices, String.format("%02d", i + 1), panelX, y, i < 3 ? NativeTheme.TEXT : NativeTheme.DIM);
            textRenderer.drawWithShadow(matrices, trim(name, panelWidth - 58), panelX + 20, y, color);
            textRenderer.drawWithShadow(matrices, rating, panelX + panelWidth - textRenderer.getWidth(rating), y, NativeTheme.TEXT);
            y += 13;
        }
        if (rows == 0) {
            drawCentered(matrices, "No completed races yet", centerX, y, NativeTheme.DIM);
        }

        // Version tag, bottom-right (service status intentionally omitted).
        String badge = "SEASON ZERO  \u00b7  BETA";
        textRenderer.drawWithShadow(matrices, badge,
            width - rightMargin - textRenderer.getWidth(badge), height - 16, NativeTheme.DIM);
    }

    private void drawCentered(MatrixStack matrices, String text, int centerX, int y, int color) {
        textRenderer.drawWithShadow(matrices, text, centerX - textRenderer.getWidth(text) / 2F, y, color);
    }

    private String trim(String value, int maxWidth) {
        if (value == null) return "";
        if (textRenderer.getWidth(value) <= maxWidth) return value;
        return textRenderer.trimToWidth(value, Math.max(0, maxWidth - textRenderer.getWidth("..."))) + "...";
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    private int leftMargin() {
        return MathHelper.clamp(width / 12, 24, 48);
    }

    private int buttonWidth() {
        return MathHelper.clamp(width * 2 / 5, 170, 230);
    }

    private static String rankName(int rating) {
        if (rating >= 1800) return "Native Master";
        if (rating >= 1500) return "Diamond";
        if (rating >= 1250) return "Platinum";
        if (rating >= 1050) return "Gold";
        if (rating >= 850) return "Silver";
        return "Bronze";
    }

    private static String clock(long seconds) {
        return String.format("%02d:%02d", seconds / 60, seconds % 60);
    }
}
