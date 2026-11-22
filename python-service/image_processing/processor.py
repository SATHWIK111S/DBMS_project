import io
import base64
import numpy as np
import cv2
from PIL import Image, ExifTags

def process_evidence_image(image_bytes: bytes) -> dict:
    """
    Validates uploaded disaster evidence photo, corrects orientation via EXIF,
    and generates thumbnail using OpenCV.
    """
    # 1. Check EXIF orientation with Pillow before OpenCV drops EXIF
    corrected_bytes = image_bytes
    try:
        pil_img = Image.open(io.BytesIO(image_bytes))
        for orientation in ExifTags.TAGS.keys():
            if ExifTags.TAGS[orientation] == 'Orientation':
                break
        
        exif = pil_img._getexif()
        if exif and orientation in exif:
            orientation_val = exif[orientation]
            if orientation_val == 3:
                pil_img = pil_img.rotate(180, expand=True)
            elif orientation_val == 6:
                pil_img = pil_img.rotate(270, expand=True)
            elif orientation_val == 8:
                pil_img = pil_img.rotate(90, expand=True)
                
            buffer = io.BytesIO()
            pil_img.save(buffer, format="JPEG", quality=95)
            corrected_bytes = buffer.getvalue()
    except Exception as e:
        # Fall back to raw bytes if EXIF read fails
        pass

    # 2. Decode with OpenCV
    np_arr = np.frombuffer(corrected_bytes, np.uint8)
    cv_img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    
    if cv_img is None or cv_img.size == 0:
        raise ValueError("Invalid or corrupted image format. Unable to decode image buffer.")
        
    height, width, channels = cv_img.shape
    if width < 10 or height < 10:
        raise ValueError("Image dimensions too small to qualify as verifiable evidence.")

    # 3. Create Thumbnail (max 240px preserving aspect ratio)
    thumb_max_dim = 240
    if width > height:
        thumb_w = thumb_max_dim
        thumb_h = int((height / width) * thumb_max_dim)
    else:
        thumb_h = thumb_max_dim
        thumb_w = int((width / height) * thumb_max_dim)
        
    thumb_img = cv2.resize(cv_img, (thumb_w, thumb_h), interpolation=cv2.INTER_AREA)
    
    # Encode thumbnail to JPEG
    success, thumb_encoded = cv2.imencode(".jpg", thumb_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
    if not success:
        raise ValueError("Failed to encode thumbnail image.")
        
    thumb_base64 = base64.b64encode(thumb_encoded.tobytes()).decode("utf-8")

    return {
        "valid": True,
        "width": int(width),
        "height": int(height),
        "channels": int(channels),
        "format": "jpeg",
        "thumbnail_data": thumb_base64,
        "message": "Image successfully validated, oriented, and thumbnail generated via OpenCV"
    }
