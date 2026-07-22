package xyz.nativelauncher.ranked.mixin;

import net.minecraft.client.gui.screen.world.CreateWorldScreen;
import net.minecraft.client.gui.widget.TextFieldWidget;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(CreateWorldScreen.class)
public interface CreateWorldScreenAccessor {
    @Accessor("levelNameField")
    TextFieldWidget nativeRanked$getLevelNameField();

    @Invoker("createLevel")
    void nativeRanked$createLevel();
}
