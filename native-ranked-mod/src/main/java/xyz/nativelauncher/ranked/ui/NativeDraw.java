package xyz.nativelauncher.ranked.ui;

import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.render.BufferBuilder;
import net.minecraft.client.render.BufferRenderer;
import net.minecraft.client.render.Tessellator;
import net.minecraft.client.render.VertexFormats;
import net.minecraft.client.util.math.MatrixStack;
import net.minecraft.util.math.Matrix4f;
import org.lwjgl.opengl.GL11;

public final class NativeDraw {
    private NativeDraw() {}

    public static void roundedRect(MatrixStack matrices, float x, float y, float width, float height, float radius, int color) {
        float r = Math.max(0, Math.min(radius, Math.min(width, height) / 2F));
        rect(matrices, x + r, y, width - r * 2F, height, color);
        rect(matrices, x, y + r, r, height - r * 2F, color);
        rect(matrices, x + width - r, y + r, r, height - r * 2F, color);
        circle(matrices, x + r, y + r, r, color, 8, 180F, 270F);
        circle(matrices, x + width - r, y + r, r, color, 8, 270F, 360F);
        circle(matrices, x + width - r, y + height - r, r, color, 8, 0F, 90F);
        circle(matrices, x + r, y + height - r, r, color, 8, 90F, 180F);
    }

    public static void borderedRect(MatrixStack matrices, float x, float y, float width, float height, float radius, int border, int fill) {
        roundedRect(matrices, x, y, width, height, radius, border);
        roundedRect(matrices, x + 1, y + 1, width - 2, height - 2, Math.max(0, radius - 1), fill);
    }

    public static void gradient(MatrixStack matrices, int x, int y, int width, int height, int top, int bottom) {
        Matrix4f matrix = matrices.peek().getModel();
        BufferBuilder buffer = Tessellator.getInstance().getBuffer();
        begin();
        buffer.begin(GL11.GL_QUADS, VertexFormats.POSITION_COLOR);
        vertex(buffer, matrix, x, y, top);
        vertex(buffer, matrix, x + width, y, top);
        vertex(buffer, matrix, x + width, y + height, bottom);
        vertex(buffer, matrix, x, y + height, bottom);
        draw(buffer);
    }

    public static void line(MatrixStack matrices, float x1, float y1, float x2, float y2, float thickness, int color) {
        float dx = x2 - x1;
        float dy = y2 - y1;
        float length = (float)Math.sqrt(dx * dx + dy * dy);
        if (length == 0) return;
        float nx = -dy / length * thickness / 2F;
        float ny = dx / length * thickness / 2F;
        Matrix4f matrix = matrices.peek().getModel();
        BufferBuilder buffer = Tessellator.getInstance().getBuffer();
        begin();
        buffer.begin(GL11.GL_QUADS, VertexFormats.POSITION_COLOR);
        vertex(buffer, matrix, x1 + nx, y1 + ny, color);
        vertex(buffer, matrix, x2 + nx, y2 + ny, color);
        vertex(buffer, matrix, x2 - nx, y2 - ny, color);
        vertex(buffer, matrix, x1 - nx, y1 - ny, color);
        draw(buffer);
    }

    public static void ring(MatrixStack matrices, float x, float y, float radius, float thickness, float start, float sweep, int color) {
        int segments = 28;
        Matrix4f matrix = matrices.peek().getModel();
        BufferBuilder buffer = Tessellator.getInstance().getBuffer();
        begin();
        buffer.begin(GL11.GL_QUAD_STRIP, VertexFormats.POSITION_COLOR);
        for (int i = 0; i <= segments; i++) {
            float angle = (float)Math.toRadians(start + sweep * i / segments);
            float cos = (float)Math.cos(angle);
            float sin = (float)Math.sin(angle);
            vertex(buffer, matrix, x + cos * radius, y + sin * radius, color);
            vertex(buffer, matrix, x + cos * (radius - thickness), y + sin * (radius - thickness), color);
        }
        draw(buffer);
    }

    public static void text(MatrixStack matrices, TextRenderer renderer, String value, float x, float y, int color) {
        renderer.draw(matrices, value, x, y, color);
    }

    public static void centered(MatrixStack matrices, TextRenderer renderer, String value, float x, float y, int color) {
        renderer.draw(matrices, value, x - renderer.getWidth(value) / 2F, y, color);
    }

    public static String ellipsis(TextRenderer renderer, String value, int maxWidth) {
        if (renderer.getWidth(value) <= maxWidth) return value;
        return renderer.trimToWidth(value, Math.max(0, maxWidth - renderer.getWidth("..."))) + "...";
    }

    private static void rect(MatrixStack matrices, float x, float y, float width, float height, int color) {
        if (width <= 0 || height <= 0) return;
        Matrix4f matrix = matrices.peek().getModel();
        BufferBuilder buffer = Tessellator.getInstance().getBuffer();
        begin();
        buffer.begin(GL11.GL_QUADS, VertexFormats.POSITION_COLOR);
        vertex(buffer, matrix, x, y, color);
        vertex(buffer, matrix, x + width, y, color);
        vertex(buffer, matrix, x + width, y + height, color);
        vertex(buffer, matrix, x, y + height, color);
        draw(buffer);
    }

    private static void circle(MatrixStack matrices, float cx, float cy, float radius, int color, int segments, float from, float to) {
        Matrix4f matrix = matrices.peek().getModel();
        BufferBuilder buffer = Tessellator.getInstance().getBuffer();
        begin();
        buffer.begin(GL11.GL_TRIANGLE_FAN, VertexFormats.POSITION_COLOR);
        vertex(buffer, matrix, cx, cy, color);
        for (int i = 0; i <= segments; i++) {
            double angle = Math.toRadians(from + (to - from) * i / segments);
            vertex(buffer, matrix, cx + (float)Math.cos(angle) * radius, cy + (float)Math.sin(angle) * radius, color);
        }
        draw(buffer);
    }

    private static void begin() {
        RenderSystem.enableBlend();
        RenderSystem.disableCull();
        RenderSystem.disableTexture();
        RenderSystem.defaultBlendFunc();
    }

    private static void draw(BufferBuilder buffer) {
        buffer.end();
        BufferRenderer.draw(buffer);
        RenderSystem.enableTexture();
        RenderSystem.enableCull();
        RenderSystem.disableBlend();
        RenderSystem.blendFunc(GlStateManager.SrcFactor.SRC_ALPHA, GlStateManager.DstFactor.ONE_MINUS_SRC_ALPHA);
    }

    private static void vertex(BufferBuilder buffer, Matrix4f matrix, float x, float y, int color) {
        float a = (color >>> 24 & 255) / 255F;
        float r = (color >>> 16 & 255) / 255F;
        float g = (color >>> 8 & 255) / 255F;
        float b = (color & 255) / 255F;
        buffer.vertex(matrix, x, y, 0).color(r, g, b, a).next();
    }
}
