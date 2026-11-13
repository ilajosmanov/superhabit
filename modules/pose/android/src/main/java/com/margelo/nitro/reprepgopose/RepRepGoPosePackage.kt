package com.margelo.nitro.reprepgopose

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider

// Only exists so RN autolinking loads the native library; the HybridObject is registered by Nitro.
class RepRepGoPosePackage : BaseReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext
  ): NativeModule? = null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider { HashMap() }

  companion object {
    init {
      reprepgoposeOnLoad.initializeNative()
    }
  }
}
