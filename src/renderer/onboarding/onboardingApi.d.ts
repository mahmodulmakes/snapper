export interface OnboardingApi {
  openSettings: () => void
  restart: () => void
}

declare global {
  interface Window {
    onboardingApi: OnboardingApi
  }
}
