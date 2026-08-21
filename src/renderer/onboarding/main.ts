const openSettingsButton = document.getElementById('open-settings')
openSettingsButton?.addEventListener('click', () => {
  window.onboardingApi.openSettings()
})
// First-run keyboard users land here with nothing focused — Open System
// Settings is the action everyone needs first, so focus it by default.
openSettingsButton?.focus()

document.getElementById('restart')?.addEventListener('click', () => {
  window.onboardingApi.restart()
})
