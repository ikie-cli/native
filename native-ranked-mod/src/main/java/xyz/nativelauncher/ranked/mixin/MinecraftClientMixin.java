package xyz.nativelauncher.ranked.mixin;

import net.minecraft.client.MinecraftClient;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import xyz.nativelauncher.ranked.RankedController;

@Mixin(MinecraftClient.class)
public abstract class MinecraftClientMixin {
    @Inject(method = "tick", at = @At("TAIL"))
    private void nativeRanked$tick(CallbackInfo info) {
        RankedController.INSTANCE.tick((MinecraftClient)(Object)this);
    }
}
