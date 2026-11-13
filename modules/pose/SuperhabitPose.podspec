require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "SuperhabitPose"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/ilajosmanov/superhabit"
  s.license      = package["license"]
  s.authors      = "Superhabit"
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/ilajosmanov/superhabit.git" }

  s.source_files = ["ios/**/*.{swift}"]
  # One model for both platforms: the Android asset, copied into its own bundle on iOS.
  s.resource_bundles = { "SuperhabitPose" => ["android/src/main/assets/pose_landmarker_full.task"] }

  load "nitrogen/generated/ios/SuperhabitPose+autolinking.rb"
  add_nitrogen_files(s)

  s.dependency "React-jsi"
  s.dependency "React-callinvoker"
  s.dependency "VisionCamera"
  s.dependency "MediaPipeTasksVision", "1.0.1"
  install_modules_dependencies(s)
end
