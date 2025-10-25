/**
 * Main entry point - initialize application when DOM is loaded
 */
main().catch(err => {
  console.error('Initialization error:', err);
  document.body.innerHTML = `<div style="padding: 20px; color: red;">初期化エラー: ${err.message}</div>`;
});