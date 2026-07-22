package xyz.nativelauncher.ranked.mixin;

import net.minecraft.entity.boss.dragon.EnderDragonEntity;
import net.minecraft.entity.boss.dragon.EnderDragonFight;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import xyz.nativelauncher.ranked.RankedController;

@Mixin(EnderDragonFight.class)
public abstract class EnderDragonFightMixin {
    @Inject(method = "dragonKilled", at = @At("TAIL"))
    private void nativeRanked$finish(EnderDragonEntity dragon, CallbackInfo info) {
        RankedController.INSTANCE.finishRace();
    }
}
