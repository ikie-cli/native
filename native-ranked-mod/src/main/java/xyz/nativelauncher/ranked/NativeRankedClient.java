package xyz.nativelauncher.ranked;

import net.fabricmc.api.ClientModInitializer;
import net.minecraft.client.MinecraftClient;

public final class NativeRankedClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        RankedController.INSTANCE.bootstrap(MinecraftClient.getInstance());
    }
}
