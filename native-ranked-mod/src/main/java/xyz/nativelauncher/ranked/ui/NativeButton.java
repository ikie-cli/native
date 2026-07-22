package xyz.nativelauncher.ranked.ui;

import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.util.math.MatrixStack;

public final class NativeButton {
    private final String label;
    private final Runnable action;
    private final boolean primary;
    private float hover;
    public int x;
    public int y;
    public int width;
    public int height;
    public boolean enabled = true;

    public NativeButton(String label, boolean primary, Runnable action) {
        this.label = label;
        this.primary = primary;
        this.action = action;
    }

    public NativeButton bounds(int x, int y, int width, int height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        return this;
    }

    public void render(MatrixStack matrices, TextRenderer renderer, int mouseX, int mouseY, float delta) {
        boolean over = enabled && contains(mouseX, mouseY);
        float target = over ? 1F : 0F;
        hover += (target - hover) * Math.min(1F, delta * 0.28F + 0.18F);
        int fill = primary ? mix(0xFFF4F4F4, 0xFFFFFFFF, hover) : mix(0xB817171B, 0xE52A2A30, hover);
        int border = primary ? 0xFFFFFFFF : mix(0x997A7A82, 0xFFD1D1D5, hover);
        if (!enabled) {
            fill = 0x99131316;
            border = 0x553A3A40;
        }
        NativeDraw.borderedRect(matrices, x, y, width, height, 3, border, fill);
        int color = enabled ? (primary ? 0xFF000000 : NativeTheme.TEXT) : NativeTheme.DIM;
        NativeDraw.centeredBold(matrices, renderer, label, x + width / 2F, y + (height - 9) / 2F, color);
    }

    public boolean click(double mouseX, double mouseY) {
        if (!enabled || !contains(mouseX, mouseY)) return false;
        action.run();
        return true;
    }

    private boolean contains(double mouseX, double mouseY) {
        return mouseX >= x && mouseX < x + width && mouseY >= y && mouseY < y + height;
    }

    private static int mix(int a, int b, float amount) {
        int aa = a >>> 24 & 255, ar = a >>> 16 & 255, ag = a >>> 8 & 255, ab = a & 255;
        int ba = b >>> 24 & 255, br = b >>> 16 & 255, bg = b >>> 8 & 255, bb = b & 255;
        return ((int)(aa + (ba - aa) * amount) << 24)
            | ((int)(ar + (br - ar) * amount) << 16)
            | ((int)(ag + (bg - ag) * amount) << 8)
            | (int)(ab + (bb - ab) * amount);
    }
}
