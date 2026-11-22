import io
import numpy as np
import cv2
from image_processing.processor import process_evidence_image
from ml.train_model import train_and_evaluate

def test_ml_pipeline():
    print("--- Testing ML Pipeline Training ---")
    artifact = train_and_evaluate()
    assert "pipeline" in artifact
    assert artifact["ml_mae"] <= artifact["baseline_mae"], "ML model should outperform or equal simple baseline"
    print("ML Pipeline Test Passed! MAE:", artifact["ml_mae"])

def test_image_processor():
    print("--- Testing OpenCV Image Processing ---")
    # Create synthetic test image (100x100 blue box)
    test_img = np.zeros((100, 100, 3), dtype=np.uint8)
    test_img[:, :] = (255, 0, 0)
    _, encoded = cv2.imencode(".jpg", test_img)
    img_bytes = encoded.tobytes()
    
    result = process_evidence_image(img_bytes)
    assert result["valid"] is True
    assert result["width"] == 100
    assert result["height"] == 100
    assert result["thumbnail_data"] is not None
    print("OpenCV Image Processing Test Passed! Thumbnail generated.")

if __name__ == "__main__":
    test_ml_pipeline()
    test_image_processor()
    print("\nALL PYTHON SERVICE TESTS PASSED!")
