require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "RepRepGoGzipFile"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/ilajosmanov/superhabit"
  s.license      = package["license"]
  s.authors      = "Superhabit"
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/ilajosmanov/superhabit.git" }

  s.source_files = ["ios/**/*.{swift}"]
  s.libraries    = "z"

  load "nitrogen/generated/ios/RepRepGoGzipFile+autolinking.rb"
  add_nitrogen_files(s)

  s.dependency "React-jsi"
  s.dependency "React-callinvoker"
  install_modules_dependencies(s)
end
