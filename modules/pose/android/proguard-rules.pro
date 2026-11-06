# Applied to every app that builds this module (consumerProguardFiles), so release builds keep what
# MediaPipe reaches by reflection: its protobuf option messages and the Nitro hybrid class it looks up by name.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }
-keepclassmembers class * extends com.google.protobuf.GeneratedMessageLite { <fields>; }
-dontwarn com.google.mediapipe.**
-keep class com.margelo.nitro.superhabitpose.** { *; }
# MediaPipe's Graph logs through Flogger, which finds its caller on the stack; inlining breaks it.
-keep class com.google.common.flogger.** { *; }
-dontwarn com.google.common.flogger.**
