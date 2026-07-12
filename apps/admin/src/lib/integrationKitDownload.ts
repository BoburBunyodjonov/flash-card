import { zipSync, strToU8 } from 'fflate'
import { partnersApi, type Partner } from '../api/partners.api'

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function downloadPartnerIntegrationKit(
  partner: Pick<Partner, 'id' | 'name' | 'slug'>,
  apiKey?: string,
) {
  const kit = await partnersApi.integrationKit(partner.id, apiKey)
  const zipped = zipSync(
    Object.fromEntries(
      Object.entries(kit.files).map(([name, content]) => [name, strToU8(content)]),
    ),
  )
  const blob = new Blob([zipped], { type: 'application/zip' })
  triggerBlobDownload(blob, `${kit.filename}.zip`)
}
