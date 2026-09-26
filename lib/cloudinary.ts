import { v2 as cloudinary } from 'cloudinary';

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
    mimeType?: string
): Promise<string> {
    try {
        const ext = (fileName.split('.').pop() ?? '').toLowerCase();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'];
        const isImage = imageExts.includes(ext);

        const detectedMime = mimeType
            || (isImage ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : 'application/pdf');

        const base64File = buffer.toString('base64');
        const dataURI = `data:${detectedMime};base64,${base64File}`;

        const result = await cloudinary.uploader.upload(dataURI, {
            resource_type: isImage ? 'image' : 'raw',
            folder: `lab-reports/${patientId}`,
            public_id: `${Date.now()}-${fileName.replace(/\.[^.]+$/, '')}`,
            ...(isImage ? {} : { format: ext === 'pdf' ? 'pdf' : undefined }),
        });

        return result.secure_url;
    } catch (error) {
        console.error('Cloudinary upload error:', error);
        throw new Error('Failed to upload file to cloud storage');
    }
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
export function extractPublicIdFromUrl(url: string): string {
    const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (matches && matches[1]) {
        return matches[1].replace(/\.[^/.]+$/, '');
    }
    return '';
}
