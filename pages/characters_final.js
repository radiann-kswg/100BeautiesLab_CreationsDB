/**
 * Main entry point - initialize application when DOM is loaded
 */
main().catch(err => {
  console.error('Initialization error:', err);
  const box = document.createElement('div');
  box.style.padding = '20px';
  box.style.color = 'red';
  box.textContent = `初期化エラー: ${err && err.message ? err.message : String(err)}`;
  document.body.textContent = '';
  document.body.appendChild(box);
});
