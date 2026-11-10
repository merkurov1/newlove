import {
  detectArtEngineModeCommand,
  getArtEngineModeText,
  isArtEngineExitCommand,
} from '../artEngineMode';

describe('Art Engine mode commands', () => {
  it.each([
    'Включи Art Engine',
    'запусти art engine',
    'Перейдём в Art Engine',
    'Хочу создать изображение',
    'turn on art engine',
    'I want to create an image',
    'Пьеро, включи Art Engine, пожалуйста',
  ])('enters Art Engine for an explicit command: %s', (text) => {
    expect(detectArtEngineModeCommand(text)).toBe('enter');
  });

  it.each([
    'Вернуться в обычный чат',
    'Вернёмся к обычному чату',
    'Выключить Art Engine',
    'Обычный режим',
    'exit art engine',
    'normal mode',
  ])('exits Art Engine for an explicit command: %s', (text) => {
    expect(detectArtEngineModeCommand(text)).toBe('exit');
    expect(isArtEngineExitCommand(text)).toBe(true);
  });

  it.each([
    'Расскажи про искусство и изображения',
    'Что такое Art Engine?',
    'Мне нравится art engine',
    'Покажи пример изображения',
    'How do I create an image in art history?',
    'The image mode in photography is interesting',
    'Обычный разговор об искусстве',
  ])('does not switch on ordinary conversation: %s', (text) => {
    expect(detectArtEngineModeCommand(text)).toBeNull();
    expect(isArtEngineExitCommand(text)).toBe(false);
  });

  it('provides a short confirmation in both languages', () => {
    expect(getArtEngineModeText('ru', 'enter')).toContain('Art Engine');
    expect(getArtEngineModeText('ru', 'enter')).toContain('обычный режим');
    expect(getArtEngineModeText('en', 'enter')).toContain('Art Engine');
    expect(getArtEngineModeText('en', 'enter')).toContain('normal mode');
    expect(getArtEngineModeText('ru', 'exit')).toContain('Обычный чат');
    expect(getArtEngineModeText('en', 'exit')).toContain('normal chat');
  });
});
