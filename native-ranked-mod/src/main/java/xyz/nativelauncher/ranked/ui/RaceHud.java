package xyz.nativelauncher.ranked.ui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.util.math.MatrixStack;
import xyz.nativelauncher.ranked.RankedController;

public final class RaceHud {
    private RaceHud() {}

    public static void render(MatrixStack matrices, MinecraftClient client, float delta) {
        RankedController controller = RankedController.INSTANCE;
        int width = 184;
        int x = client.getWindow().getScaledWidth() - width - 12;
        int y = 12;
        NativeDraw.borderedRect(matrices, x, y, width, 83, 8, 0xCC33303E, 0xD913121A);
        NativeDraw.roundedRect(matrices, x + 10, y + 10, 19, 19, 6, NativeTheme.ACCENT);
        NativeDraw.monogram(matrices, x + 19.5F, y + 19.5F, 7, 0xFF000000);
        NativeDraw.text(matrices, client.textRenderer, "NATIVE RANKED", x + 37, y + 11, NativeTheme.TEXT);
        String timer;
        long startsAt = controller.startsAt();
        if (!controller.raceStarted()) timer = "PREPARING";
        else timer = formatDuration(Math.max(0, System.currentTimeMillis() - startsAt));
        NativeDraw.text(matrices, client.textRenderer, timer, x + 37, y + 25, controller.raceStarted() ? NativeTheme.ACCENT_BRIGHT : NativeTheme.MUTED);
        NativeDraw.line(matrices, x + 10, y + 43, x + width - 10, y + 43, 1, 0xAA33303E);
        NativeDraw.text(matrices, client.textRenderer, NativeDraw.ellipsis(client.textRenderer, controller.opponentName(), 98), x + 10, y + 53, NativeTheme.TEXT);
        NativeDraw.text(matrices, client.textRenderer, pretty(controller.opponentProgress()), x + 10, y + 67, NativeTheme.MUTED);
        String self = pretty(controller.ownProgress());
        NativeDraw.text(matrices, client.textRenderer, self, x + width - 10 - NativeDraw.width(client.textRenderer, self), y + 53, NativeTheme.ACCENT_BRIGHT);
        NativeDraw.roundedRect(matrices, x + width - 16, y + 68, 6, 6, 3, NativeTheme.GREEN);
    }

    public static String formatDuration(long millis) {
        long totalSeconds = millis / 1000;
        long hours = totalSeconds / 3600;
        long minutes = totalSeconds / 60 % 60;
        long seconds = totalSeconds % 60;
        long centis = millis / 10 % 100;
        return hours > 0
            ? String.format("%d:%02d:%02d.%02d", hours, minutes, seconds, centis)
            : String.format("%02d:%02d.%02d", minutes, seconds, centis);
    }

    private static String pretty(String progress) {
        if (progress == null || progress.isEmpty()) return "Waiting";
        return Character.toUpperCase(progress.charAt(0)) + progress.substring(1);
    }
}
