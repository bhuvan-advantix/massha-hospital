import { v2 as cloudinary, type UploadApiErrorResponse } from 'cloudinary';
import { randomUUID } from 'node:crypto';

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a PDF or image file to Cloudinary.
 * Detects whether the file is an image or PDF and sets the correct resource_type.
 */
export async function uploadPdfToCloudinary(
    buffer: Buffer,
    fileName: string,
    patientId: string,
): Promise<string> {
    const ext = (fileName.split('.').pop() ?? '').toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'];
    const isImage = imageExts.includes(ext);
    const resourceType = isImage ? 'image' : 'raw';
    const publicId = `${patientId}/${randomUUID()}`;

    if (!buffer.length) throw new Error('The selected file is empty.');

    // Uploading the original Buffer avoids Base64 expansion and is more reliable for
    // multi-megabyte PDFs. The same unique public ID makes a retry idempotent.
    const uploadOnce = () => new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
            resource_type: resourceType,
            folder: 'lab-reports',
            public_id: publicId,
            overwrite: true,
            ...(isImage ? {} : { format: ext || 'pdf' }),
        }, (error, result) => {
            if (error) reject(error);
            else if (result?.secure_url) resolve(result.secure_url);
            else reject(new Error('Cloudinary did not return an uploaded file URL.'));
        });
        stream.end(buffer);
    });

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await uploadOnce();
        } catch (error: unknown) {
            lastError = error;
            const status = getCloudinaryStatus(error);
            const canRetry = status === 408 || status === 429 || status >= 500;
            if (!canRetry || attempt === 2) break;
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        }
    }

    const status = getCloudinaryStatus(lastError);
    console.error('Cloudinary upload failed after retrying:', { status, message: getErrorMessage(lastError) });
    throw new Error(status
        ? `Cloud storage is temporarily unavailable (HTTP ${status}). Please retry the document upload.`
        : 'Failed to upload the file to cloud storage. Please retry.');
}

function getCloudinaryStatus(error: unknown): number {
    if (!error || typeof error !== 'object') return 0;
    const record = error as Partial<UploadApiErrorResponse> & { status?: number };
    return Number(record.http_code || record.status || 0);
}

function getErrorMessage(error: unknown): string | undefined {
    return error instanceof Error ? error.message : undefined;
}

/**
 * Delete a file from Cloudinary by public ID.
 */
export async function deletePdfFromCloudinary(publicId: string): Promise<void> {
    try {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    } catch (error) {
        console.error('Cloudinary delete error:', error);
    }
}

/**
 * Extract public ID from a Cloudinary URL.
 */
export function cloudinaryAsset(url: string) {
    const parsed = new URL(url);
    const parts = parsed.pathname.match(/^\/([^/]+)\/(raw|image)\/upload\/(?:v\d+\/)?(.+)$/);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com' || !parts || parts[1] !== process.env.CLOUDINARY_CLOUD_NAME) {
        throw new Error('Invalid Cloudinary asset URL');
    }
    const resourceType = parts[2] as 'raw' | 'image';
    const path = decodeURIComponent(parts[3]);
    const format = path.match(/\.([^/.]+)$/)?.[1] || '';
    // Raw public IDs include their extension; image public IDs do not.
    return { publicId: resourceType === 'raw' ? path : path.replace(/\.[^/.]+$/, ''), resourceType, format };
}

export function extractPublicIdFromUrl(url: string): string {
    return cloudinaryAsset(url).publicId;
}

export async function fetchCloudinaryBuffer(url: string): Promise<Buffer> {
    const asset = cloudinaryAsset(url);
    const signed = cloudinary.utils.private_download_url(asset.publicId, asset.resourceType === 'raw' ? '' : asset.format, {
        resource_type: asset.resourceType, type: 'upload', expires_at: Math.floor(Date.now() / 1000) + 300,
    });
    for (const target of [signed, url, signed]) {
        try {
            const response = await fetch(target, { signal: AbortSignal.timeout(30_000), cache: 'no-store' });
            if (response.ok) return Buffer.from(await response.arrayBuffer());
        } catch {
            // Network failures must not prevent trying the alternate delivery path.
        }
    }
    throw new Error('Unable to retrieve the original document from Cloudinary');
}
