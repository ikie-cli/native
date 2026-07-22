package xyz.nativelauncher.ranked.ui;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.util.math.MatrixStack;
import xyz.nativelauncher.ranked.RankedController;

/**
 * Clean, vanilla-styled race HUD — a centered speedrun timer with a single
 * live split line (you vs. opponent), drawn in the Minecraft font with plain
 * drop shadows. Deliberately minimal: no modern card, accent chrome, or blur.
 */
public final class RaceHud {
    private RaceHud() {}

    public static void render(MatrixStack matrices, MinecraftClient client, float delta) {
        RankedController controller = RankedController.INSTANCE;
        TextRenderer font = client.textRenderer;
        int screenWidth = client.getWindow().getScaledWidth();
        boolean started = controller.raceStarted();

        // Timer — top-centre, Minecraft font scaled up like a speedrun timer.
        String timer = started
            ? formatDuration(Math.max(0, System.currentTimeMillis() - controller.startsAt()))
            : "PREPARING";
        float scale = 1.7F;
        matrices.push();
        matrices.scale(scale, scale, 1F);
        font.drawWithShadow(matrices, timer, (screenWidth / scale - font.getWidth(timer)) / 2F, 8F / scale, 0xFFFFFFFF);
        matrices.pop();

        // Split line under the timer: you (left) · opponent (right).
        String you = "You  " + pretty(controller.ownProgress());
        String opp = pretty(controller.opponentProgress()) + "  " + controller.opponentName();
        int y = 8 + Math.round(font.fontHeight * scale) + 5;
        int gap = 9;
        font.drawWithShadow(matrices, you, screenWidth / 2F - gap - font.getWidth(you), y, 0xFFFFFFFF);
        font.drawWithShadow(matrices, "\u2502", screenWidth / 2F - font.getWidth("\u2502") / 2F, y, 0xFF6A6A6A);
        font.drawWithShadow(matrices, opp, screenWidth / 2F + gap, y, 0xFFBFBFBF);
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
        switch (progress.toLowerCase(java.util.Locale.ROOT)) {
            case "waiting": return "Waiting";
            case "overworld": return "Overworld";
            case "nether": return "Nether";
            case "bastion": return "Pearls";
            case "fortress": return "Blaze rods";
            case "stronghold": return "Eyes";
            case "end": return "The End";
            case "finished": return "Finished";
            default: return Character.toUpperCase(progress.charAt(0)) + progress.substring(1);
        }
    }
}
