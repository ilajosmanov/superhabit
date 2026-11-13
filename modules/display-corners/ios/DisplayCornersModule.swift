import ExpoModulesCore
import UIKit

public final class DisplayCornersModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DisplayCorners")

    // Radii in points; null before iOS 26, which has no public way to read them.
    AsyncFunction("corners") { () -> [String: Double]? in
      guard #available(iOS 26.0, *) else { return nil }
      return MainActor.assumeIsolated { readCorners() }
    }.runOnQueue(.main)
  }
}

// shortcut: written without a Mac; run it on an iPhone (known radius) before shipping iOS.
// A full-window view whose corners are concentric with its container resolves to the display's own.
@available(iOS 26.0, *)
@MainActor
private func readCorners() -> [String: Double]? {
  guard let window = Utilities.keyWindow() else { return nil }
  let probe = UIView(frame: window.bounds)
  probe.isUserInteractionEnabled = false
  probe.cornerConfiguration = .corners(radius: .containerConcentric())
  window.addSubview(probe)
  defer { probe.removeFromSuperview() }
  probe.layoutIfNeeded()
  return [
    "topLeft": Double(probe.effectiveRadius(corner: .topLeft)),
    "topRight": Double(probe.effectiveRadius(corner: .topRight)),
    "bottomRight": Double(probe.effectiveRadius(corner: .bottomRight)),
    "bottomLeft": Double(probe.effectiveRadius(corner: .bottomLeft)),
  ]
}
