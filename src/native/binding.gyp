{
  "targets": [
    {
      "target_name": "dev_tools_native",
      "sources": [
        "src/main.cc",
        "src/file-compare/file_compare.cpp",
        "src/screen-freeze/screen_freeze.cc",
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
         "src/",
         "src/window-info/",
         "src/file-compare/",
         "src/cursor/",
         "src/screen-freeze",
         "src/screen-freeze/windows/",
         "src/screen-freeze/linux/",
         "src/screen-freeze/macos/" 
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_VERSION=8" ],
      "conditions": [
        ["OS=='win'", {
          "sources": ["src/window-info/windows/window_enumerator.cc","src/screen-freeze/windows/win_freeze.cc"],
          "libraries": [
            "-luser32.lib",
            "-lgdi32.lib",
            "-ldwmapi.lib",
            "-lpsapi.lib",
            "-lzlib.lib"
          ],
          "cflags!": [ "-fno-exceptions" ],
          "cflags_cc!": [ "-fno-exceptions" ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": [ "/std:c++17", "/wd4996" ],
              "RuntimeLibrary": 2
            }
           
          }
        }],
        ["OS=='mac'", {
          "sources": ["src/window-info/macos/window_enumerator.cc","src/screen-freeze/macos/mac_freeze.cc"],
          "frameworks": ["Cocoa", "CoreFoundation", "CoreGraphics"],
          "cflags_cc": [ "-std=c++17" ],
          "cflags!": [ "-fno-exceptions" ],
          "cflags_cc!": [ "-fno-exceptions" ]
        }],
        ["OS=='linux'", {
          "sources": ["src/window-info/linux/window_enumerator.cc","src/cursor/cursor.cc","src/screen-freeze/linux/linux_freeze.cc"],
          "include_dirs": [
            "/usr/include/X11",
            "/usr/lib/aarch64-linux-gnu",
            "/usr/include/libdrm",
          ],
          "cflags": [
            "-fPIC",
            "-Wall",
            "-Wno-unused-variable",
            "-march=armv8-a"
          ],
          "cflags_cc": [
            "-std=c++17"
          ],
          "libraries": [
            "-lX11",
            "-lXtst",
            "-lz",
            "-ldrm",
            "-lpthread"
          ],
          "ldflags": [
            "-L/usr/lib/aarch64-linux-gnu",
            "-Wl,-rpath=/usr/lib/aarch64-linux-gnu",
          ],
          "defines": [
            "KYLIN_OS=1",
            "UKUI_DESKTOP=1"
          ],
          "cflags!": [ "-fno-exceptions" ],
          "cflags_cc!": [ "-fno-exceptions" ]
        }]
      ]
    }
  ]
}