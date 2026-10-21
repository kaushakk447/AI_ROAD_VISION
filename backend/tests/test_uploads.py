from app.services.upload_service import _valid_signature


def test_image_signatures_match_supported_extensions():
    assert _valid_signature(".jpg", b"\xff\xd8\xffphoto", "image")
    assert _valid_signature(".png", b"\x89PNG\r\n\x1a\ndata", "image")
    assert _valid_signature(".webp", b"RIFF\x00\x00\x00\x00WEBPdata", "image")
    assert not _valid_signature(".png", b"not an image", "image")


def test_video_signatures_match_supported_extensions():
    assert _valid_signature(".mp4", b"\x00\x00\x00\x18ftypisom", "video")
    assert _valid_signature(".mov", b"\x00\x00\x00\x18ftypqt  ", "video")
    assert _valid_signature(".avi", b"RIFF\x00\x00\x00\x00AVI ", "video")
    assert _valid_signature(".mkv", b"\x1aE\xdf\xa3data", "video")
    assert not _valid_signature(".mp4", b"not a video", "video")
