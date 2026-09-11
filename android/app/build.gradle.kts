plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.xiaoxuhui.conway"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.xiaoxuhui.conway"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.16.0"

        // 应用为单语言中文工具，去掉无用资源以减小体积
        resourceConfigurations += listOf("zh", "en")
    }

    buildTypes {
        debug {
            // 首版使用 debug 签名，便于直接安装
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.2")
    implementation("androidx.webkit:webkit:1.11.0")
}
