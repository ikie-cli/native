package xyz.nativelauncher.ranked.ui;

import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.LiteralText;
import xyz.nativelauncher.ranked.RankedController;

public final class RaceResultScreen extends Screen {
    private final RankedController controller = RankedController.INSTANCE;
    private NativeButton home;
    private float reveal;

    public RaceResultScreen() {
        super(new LiteralText("Race complete"));
    }

    @Override
    protected void init() {
        home = new NativeButton("RETURN TO RANKED", true, () -> controller.returnHome(client))
            .bounds(width / 2 - 92, height / 2 + 66, 184, 30);
    }

    @Override
    public void tick() { reveal += (1F - reveal) * 0.14F + 0.005F; }

    @Override
    public void render(MatrixStack matrices, int mouseX, int mouseY, float delta) {
        NativeDraw.gradient(matrices, 0, 0, width, height, 0xF209090D, 0xF2120C1D);
        int cardWidth = Math.min(410, width - 40);
        int x = (width - cardWidth) / 2;
        int y = height / 2 - 114 + (int)((1F - Math.min(1F, reveal)) * 16);
        NativeDraw.borderedRect(matrices, x, y, cardWidth, 228, 12, NativeTheme.BORDER, NativeTheme.SURFACE);
        boolean won = controller.won();
        int color = won ? NativeTheme.GREEN : NativeTheme.RED;
        NativeDraw.roundedRect(matrices, x + cardWidth / 2F - 24, y + 19, 48, 48, 14, won ? 0xFF183524 : 0xFF3A1720);
        NativeDraw.centered(matrices, textRenderer, won ? "W" : "L", x + cardWidth / 2F, y + 39, color);
        NativeDraw.centered(matrices, textRenderer, won ? "VICTORY" : "RACE COMPLETE", x + cardWidth / 2F, y + 82, NativeTheme.TEXT);
        NativeDraw.centered(matrices, textRenderer, "versus " + controller.opponentName(), x + cardWidth / 2F, y + 99, NativeTheme.MUTED);

        int deltaRating = controller.ratingDelta();
        String deltaText = deltaRating > 0 ? "+" + deltaRating : Integer.toString(deltaRating);
        NativeDraw.centered(matrices, textRenderer, deltaText + " RATING", x + cardWidth / 2F, y + 126, deltaRating >= 0 ? NativeTheme.GREEN : NativeTheme.RED);
        long millis = controller.finishMs();
        if (millis > 0) NativeDraw.centered(matrices, textRenderer, RaceHud.formatDuration(millis), x + cardWidth / 2F, y + 145, NativeTheme.MUTED);
        home.bounds(width / 2 - 92, y + 180, 184, 30);
        home.render(matrices, textRenderer, mouseX, mouseY, delta);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        return button == 0 && home.click(mouseX, mouseY) || super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean shouldCloseOnEsc() { return false; }
}
