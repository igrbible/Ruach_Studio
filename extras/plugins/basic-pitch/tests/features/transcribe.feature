Feature: Transcribe a take's stems to MIDI
  As a Ruach Studio user
  I want each separated stem turned into a MIDI file
  So that I can edit the notes in a DAW or the piano roll

  Scenario: Every stem with notes becomes a MIDI file
    Given a stem set containing "vocals" and "bass"
    And the transcriber finds 3 notes in "vocals"
    And the transcriber finds 5 notes in "bass"
    When the step runs
    Then the file "vocals.mid" is written
    And the file "bass.mid" is written
    And the report row for "bass" says "ok" with 5 notes
    And the last line of output lists "vocals.mid" and "bass.mid"

  Scenario: A silent stem is reported but gets no MIDI file
    Given a stem set containing "vocals" and "drums"
    And the transcriber finds 4 notes in "vocals"
    And the transcriber finds 0 notes in "drums"
    When the step runs
    Then the file "vocals.mid" is written
    And no file "drums.mid" is written
    And the report row for "drums" says "silent" with 0 notes

  Scenario: One failing stem does not lose the others
    Given a stem set containing "vocals" and "bass"
    And the transcriber finds 2 notes in "vocals"
    And the transcriber fails on "bass"
    When the step runs
    Then the file "vocals.mid" is written
    And the report row for "bass" says "error" with 0 notes
    And the step exits with code 0

  Scenario: Every stem failing is an error
    Given a stem set containing "vocals" and "bass"
    And the transcriber fails on "vocals"
    And the transcriber fails on "bass"
    When the step runs
    Then the step exits with code 1

  Scenario: A missing manifest is an error
    Given an audio folder without a manifest
    When the step runs
    Then the step exits with code 1
    And the error output mentions "manifest.json"

  Scenario: A stem file pointing outside its folder is refused
    Given a stem set whose manifest points outside its folder
    When the step runs
    Then the step exits with code 1
    And the error output mentions "leaves its folder"
