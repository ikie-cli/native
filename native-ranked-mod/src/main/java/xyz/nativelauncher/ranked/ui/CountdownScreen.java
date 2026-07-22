package xyz.nativelauncher.ranked.ui;

import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.text.LiteralText;
import xyz.nativelauncher.ranked.RankedController;

public final class CountdownScreen extends Screen {
    private final RankedController controller = RankedController.INSTANCE;
    private NativeButton leave;
    private float phase;

    public CountdownScreen() {
        super(new LiteralText("Native Ranked countdown"));
    }

    @Override
    protected void init() {
        leave = new NativeButton("LEAVE MATCH", false, () -> controller.leaveMatch(client));
    }

    @Override
    public void tick() { phase += 0.065F; }

    @Override
    public void render(MatrixStack matrices, int mouseX, int mouseY, float delta) {
        NativeDraw.gradient(matrices, 0, 0, width, height, 0xF20A090E, 0xF20E0A16);
        int cardWidth = Math.min(410, width - 40);
        int cardHeight = 188;
        int x = (width - cardWidth) / 2;
        int y = (height - cardHeight) / 2;
        NativeDraw.borderedRect(matrices, x, y, cardWidth, cardHeight, 12, NativeTheme.BORDER, NativeTheme.SURFACE);
        NativeDraw.roundedRect(matrices, x + 18, y + 17, 28, 28, 8, NativeTheme.ACCENT);
        NativeDraw.monogram(matrices, x + 32, y + 31, 9, 0xFF000000);
        NativeDraw.text(matrices, textRenderer, "MATCH FOUND", x + 58, y + 20, NativeTheme.TEXT);
        NativeDraw.text(matrices, textRenderer, "Worlds are synchronized by Native", x + 58, y + 35, NativeTheme.MUTED);
        NativeDraw.line(matrices, x + 18, y + 61, x + cardWidth - 18, y + 61, 1, NativeTheme.BORDER);

        long startsAt = controller.startsAt();
        long remaining = startsAt <= 0 ? -1 : Math.max(0, startsAt - System.currentTimeMillis());
        String center = remaining < 0 ? "READY" : remaining == 0 ? "GO" : Long.toString((remaining + 999) / 1000);
        NativeDraw.ring(matrices, x + cardWidth / 2F, y + 104, 29, 3, -90 + phase * 45F, remaining < 0 ? 250 : 360, NativeTheme.ACCENT);
        NativeDraw.centered(matrices, textRenderer, center, x + cardWidth / 2F, y + 100, NativeTheme.TEXT);
        String detail = remaining < 0 ? "Waiting for " + controller.opponentName() : "Race begins at the same instant for both players";
        NativeDraw.centered(matrices, textRenderer, NativeDraw.ellipsis(textRenderer, detail, cardWidth - 40), x + cardWidth / 2F, y + 144, NativeTheme.MUTED);

        // Only offer the escape hatch while still waiting for the opponent to
        // ready — never during the live 5-second countdown.
        if (remaining < 0) {
            leave.bounds((width - 184) / 2, y + cardHeight + 12, 184, 20);
            leave.render(matrices, textRenderer, mouseX, mouseY, delta);
        } else {
            NativeDraw.centered(matrices, textRenderer, "Do not close this screen", x + cardWidth / 2F, y + 162, NativeTheme.DIM);
        }
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0 && controller.startsAt() <= 0 && leave != null && leave.click(mouseX, mouseY)) return true;
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        // Esc bails out only while waiting for the opponent (avoids a stuck screen).
        if (keyCode == 256 && controller.startsAt() <= 0) {
            controller.leaveMatch(client);
            return true;
        }
        return true;
    }

    @Override
    public boolean shouldCloseOnEsc() { return false; }

    @Override
    public boolean isPauseScreen() { return true; }
}
