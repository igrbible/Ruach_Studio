#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface MiniTTSDemoBridge : NSObject

- (nullable instancetype)initWithModelPath:(NSString *)modelPath
                                      task:(NSString *)task
                                   backend:(NSString *)backend
                                    device:(int)device
                                   threads:(int)threads
                                     error:(NSError **)error;

- (BOOL)runVoiceCloneWithText:(NSString *)text
                     language:(NSString *)language
                  voiceRefPath:(NSString *)voiceRefPath
                 referenceText:(NSString *)referenceText
                    outputPath:(NSString *)outputPath
                          seed:(uint32_t)seed
                  maxNewTokens:(int64_t)maxNewTokens
                         error:(NSError **)error;

- (BOOL)runVoiceDesignWithText:(NSString *)text
                      language:(NSString *)language
                      instruct:(NSString *)instruct
                    outputPath:(NSString *)outputPath
                          seed:(uint32_t)seed
                  maxNewTokens:(int64_t)maxNewTokens
                         error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
