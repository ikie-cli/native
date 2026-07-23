package xyz.nativelauncher.ranked.ui;

/**
 * Rank tiers with MCSR-style divisions. Each tier spans a rating band split
 * into three divisions (III bottom, II middle, I top); the apex tier has none.
 */
public final class Ranks {
    private Ranks() {}

    public static String tier(int rating) {
        if (rating >= 1800) return "Native Master";
        if (rating >= 1500) return "Diamond";
        if (rating >= 1250) return "Platinum";
        if (rating >= 1050) return "Gold";
        if (rating >= 850) return "Silver";
        return "Bronze";
    }

    /** Full rank, e.g. "Gold II" (apex tier has no division). */
    public static String name(int rating) {
        if (rating >= 1800) return "Native Master";
        return tier(rating) + " " + division(rating);
    }

    public static String division(int rating) {
        int lo;
        int hi;
        if (rating >= 1500) { lo = 1500; hi = 1800; }
        else if (rating >= 1250) { lo = 1250; hi = 1500; }
        else if (rating >= 1050) { lo = 1050; hi = 1250; }
        else if (rating >= 850) { lo = 850; hi = 1050; }
        else { lo = 0; hi = 850; }
        int band = Math.max(1, (hi - lo) / 3);
        if (rating >= lo + 2 * band) return "I";
        if (rating >= lo + band) return "II";
        return "III";
    }
}
