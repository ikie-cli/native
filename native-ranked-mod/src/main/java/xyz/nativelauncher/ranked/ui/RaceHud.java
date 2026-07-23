package xyz.nativelauncher.ranked.ui;

import com.google.gson.JsonObject;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.font.TextRenderer;
import net.minecraft.client.util.math.MatrixStack;
import xyz.nativelauncher.ranked.RankedController;

/**
 * Clean, vanilla-styled race HUD: a centered speedrun timer, a live you-vs-opponent
 * position line, and a top-left split-comparison table (your time, the opponent's
 * time, and the delta per milestone). Minecraft font, plain drop shadows.
 */
public final class RaceHud {
    // milestone key -> label, in run order.
    private static final String[][] SPLITS = {
        {"nether", "Nether"},
        {"bastion", "Bastion"},
        {"fortress", "Fortress"},
        {"stronghold", "Stronghold"},
        {"end", "The End"}
    };

    private RaceHud() {}

    public static void render(MatrixStack matrices, MinecraftClient client, float delta) {
        RankedController controller = RankedController.INSTANCE;
        TextRenderer font = client.textRenderer;
        int screenWidth = client.getWindow().getScaledWidth();
        boolean started = controller.raceStarted();

        // Timer — top-centre, scaled up like a speedrun timer.
        String timer = started
            ? formatDuration(Math.max(0, System.currentTimeMillis() - controller.startsAt()))
            : "PREPARING";
        float scale = 1.7F;
        matrices.push();
        matrices.scale(scale, scale, 1F);
        font.drawWithShadow(matrices, timer, (screenWidth / scale - font.getWidth(timer)) / 2F, 8F / scale, 0xFFFFFFFF);
        matrices.pop();

        // Live position line under the timer: you (left) · opponent (right).
        String you = "You  " + pretty(controller.ownProgress());
        String opp = pretty(controller.opponentProgress()) + "  " + controller.opponentName();
        int y = 8 + Math.round(font.fontHeight * scale) + 5;
        int gap = 9;
        font.drawWithShadow(matrices, you, screenWidth / 2F - gap - font.getWidth(you), y, 0xFFFFFFFF);
        font.drawWithShadow(matrices, "\u2502", screenWidth / 2F - font.getWidth("\u2502") / 2F, y, 0xFF6A6A6A);
        font.drawWithShadow(matrices, opp, screenWidth / 2F + gap, y, 0xFFBFBFBF);

        renderSplitTable(matrices, font, controller);
    }

    /** Top-left comparison table: milestone · your split · opponent split · delta. */
    private static void renderSplitTable(MatrixStack matrices, TextRenderer font, RankedController controller) {
        JsonObject mine = controller.selfSplits();
        JsonObject theirs = controller.opponentSplits();
        int x = 6;
        int y = 6;
        final int youRight = x + 108;
        final int oppRight = x + 154;
        final int deltaX = x + 160;

        font.drawWithShadow(matrices, "SPLITS", x, y, 0xFF9A9A9A);
        font.drawWithShadow(matrices, "YOU", youRight - font.getWidth("YOU"), y, 0xFF7A7A7A);
        font.drawWithShadow(matrices, "OPP", oppRight - font.getWidth("OPP"), y, 0xFF7A7A7A);
        y += 11;

        boolean any = false;
        for (String[] split : SPLITS) {
            long ym = mine == null ? 0 : RankedController.number(mine, split[0], 0);
            long om = theirs == null ? 0 : RankedController.number(theirs, split[0], 0);
            if (ym == 0 && om == 0) continue;
            any = true;
            font.drawWithShadow(matrices, split[1], x, y, 0xFFE0E0E0);
            String yt = ym > 0 ? clock(ym) : "\u2013";
            String ot = om > 0 ? clock(om) : "\u2013";
            font.drawWithShadow(matrices, yt, youRight - font.getWidth(yt), y, 0xFFFFFFFF);
            font.drawWithShadow(matrices, ot, oppRight - font.getWidth(ot), y, 0xFFBFBFBF);
            if (ym > 0 && om > 0) {
                long d = ym - om; // negative → you reached it first
                String dt = (d <= 0 ? "-" : "+") + clock(Math.abs(d));
                font.drawWithShadow(matrices, dt, deltaX, y, d <= 0 ? 0xFF6AE58A : 0xFFF6787D);
            }
            y += 10;
        }
        if (!any) {
            font.drawWithShadow(matrices, "Overworld\u2026", x, y, 0xFF8A8A8A);
        }
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

    private static String clock(long millis) {
        long totalSeconds = millis / 1000;
        return String.format("%d:%02d", totalSeconds / 60, totalSeconds % 60);
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
