import {
    defineConfig,
    minimal2023Preset,
} from '@vite-pwa/assets-generator/config'

const iconResizeOptions = {
    fit: 'cover' as const,
    background: '#39261D',
}

const preset = {
    ...minimal2023Preset,
    transparent: {
        ...minimal2023Preset.transparent,
        padding: 0,
        resizeOptions: iconResizeOptions,
    },
    maskable: {
        ...minimal2023Preset.maskable,
        padding: 0,
        resizeOptions: iconResizeOptions,
    },
    apple: {
        ...minimal2023Preset.apple,
        padding: 0,
        resizeOptions: iconResizeOptions,
    },
}

export default defineConfig({
    headLinkOptions: {
        preset: '2023',
    },
    preset,
    images: ['public/pwa-64x64.png'],
})
