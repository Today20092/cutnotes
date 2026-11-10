# Premiere marker export

Owners and Editors can open **Export markers** from a ready video revision. Choose All comments or Unresolved only, confirm the edit frame rate, and enter the sequence's non-drop start timecode. Download XML, then import it in Premiere using File → Import.

The file is Final Cut Pro 7 XML (`xmeml` version 5), containing a separate sequence with point markers. Marker timing is relative to the uploaded cut; the sequence start timecode determines displayed timecode. It does not merge markers into an existing edit. Imported marker sequences need to be aligned with the matching cut. Different cuts or edits will not automatically conform the comments.

Author, text, resolution status and a drawing-presence note are included. Drawings themselves are not embedded. Common integer and 1000/1001 rates are supported. This first implementation supports non-drop timecode only; drop-frame start timecodes are rejected. Frame-rate detection is a convenience, so editors must confirm it against their sequence.

References: Apple's Final Cut Pro XML Elements Catalog and DTD describe sequence, rate, timecode and marker elements:
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/FinalCutPro_XML/Elements/Elements.html
- https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/FinalCutPro_XML/DTD/DTD.html

Validation: typecheck/lint and four export tests pass (XML escaping, marker order, filters, fractional timing and invalid timecodes). A generated file was parsed with Python's XML parser. The export dialog was opened at 320px without horizontal overflow. Import into a real Premiere installation remains unverified; do not treat structural XML validation as proof of Premiere interoperability.
