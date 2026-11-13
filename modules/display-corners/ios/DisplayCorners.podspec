Pod::Spec.new do |s|
  s.name           = 'DisplayCorners'
  s.version        = '0.1.0'
  s.summary        = "Reads the display's rounded-corner radii."
  s.license        = 'UNLICENSED'
  s.author         = 'Superhabit'
  s.homepage       = 'https://github.com/ilajosmanov/superhabit'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
