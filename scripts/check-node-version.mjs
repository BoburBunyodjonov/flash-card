const major = Number(process.versions.node.split('.')[0])

if (major !== 20) {
  console.error(
    `\n❌ Node ${process.versions.node} qo'llab-quvvatlanmaydi. Loyiha uchun Node 20 kerak.\n`,
  )
  console.error('  nvm:  cd loyiha papkasi && nvm install && nvm use')
  console.error('  fnm:  cd loyiha papkasi && fnm use')
  console.error('  brew: export PATH="/opt/homebrew/opt/node@20/bin:$PATH"\n')
  process.exit(1)
}
