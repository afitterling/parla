Pod::Spec.new do |s|
  s.name           = 'ParlaICloud'
  s.version        = '1.0.0'
  s.summary        = 'iCloud document storage for Parla'
  s.description    = 'Reads and writes JSON files in the app iCloud ubiquity container.'
  s.author         = ''
  s.homepage       = 'https://parla.app'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
