plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The TV web UI is shared with the Hisense VIDAA app: copy ../vidaa-media/web into the APK assets.
val webUi = rootProject.file("../vidaa-media/web")
val webAssetsDir = layout.buildDirectory.dir("generated/hc-assets")
val copyWebUi by tasks.registering(Copy::class) {
    from(webUi) { exclude("icon.svg") }
    into(webAssetsDir.map { it.dir("web") })
}

android {
    namespace = "com.homecinema.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.homecinema.tv"
        minSdk = 22
        // 29 keeps classic storage access (requestLegacyExternalStorage) on Fire OS 8 / Android 11,
        // which is what lets the app read USB drives without the Play-only "all files" permission.
        targetSdk = 29
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        // Sideloaded apps only need a stable key; set HC_KEYSTORE etc. to use your own.
        create("release") {
            val ks = System.getenv("HC_KEYSTORE")
            if (ks != null) {
                storeFile = file(ks)
                storePassword = System.getenv("HC_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HC_KEY_ALIAS")
                keyPassword = System.getenv("HC_KEY_PASSWORD")
            } else {
                val dbg = signingConfigs.getByName("debug")
                storeFile = dbg.storeFile; storePassword = dbg.storePassword; keyAlias = dbg.keyAlias; keyPassword = dbg.keyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
        }
    }

    sourceSets["main"].assets.srcDir(webAssetsDir)

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    lint { abortOnError = false; checkReleaseBuilds = false }
}

tasks.named("preBuild") { dependsOn(copyWebUi) }

dependencies {
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    testImplementation("junit:junit:4.13.2")
}
