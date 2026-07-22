package xyz.nativelauncher.ranked.mixin;

import net.minecraft.server.integrated.IntegratedServer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;
import xyz.nativelauncher.ranked.RankedController;

/**
 * Prevents enabling cheats while a ranked match is active. "Open to LAN → Allow
 * Cheats" is the only way to unlock commands in a single-player race world, so we
 * force the cheats flag off during a match — a player can still open to LAN, but
 * /gamemode, /tp, and friends stay disabled until the race is over.
 */
@Mixin(IntegratedServer.class)
public abstract class IntegratedServerMixin {
    @ModifyVariable(method = "openToLan", at = @At("HEAD"), argsOnly = true, ordinal = 0)
    private boolean nativeRanked$forceNoCheatsInRanked(boolean cheatsAllowed) {
        return RankedController.INSTANCE.matchActive() ? false : cheatsAllowed;
    }
}
