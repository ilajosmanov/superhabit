package com.ilajosmanov.superhabit.displaycorners

import android.os.Build
import android.view.RoundedCorner
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DisplayCornersModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DisplayCorners")

    // Radii in dp for the window's current rotation; null before Android 12, where the system doesn't say.
    AsyncFunction("corners") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return@AsyncFunction null
      val view = appContext.currentActivity?.window?.decorView ?: return@AsyncFunction null
      val insets = view.rootWindowInsets ?: return@AsyncFunction null
      val density = view.resources.displayMetrics.density
      // A null corner is a square one.
      fun radius(position: Int) = (insets.getRoundedCorner(position)?.radius ?: 0) / density
      mapOf(
        "topLeft" to radius(RoundedCorner.POSITION_TOP_LEFT),
        "topRight" to radius(RoundedCorner.POSITION_TOP_RIGHT),
        "bottomRight" to radius(RoundedCorner.POSITION_BOTTOM_RIGHT),
        "bottomLeft" to radius(RoundedCorner.POSITION_BOTTOM_LEFT),
      )
    }.runOnQueue(Queues.MAIN)
  }
}
