export interface ParsedOutput {
  type: 'response';
  content: string;
}

export class OutputParser {
  parse(data: string): ParsedOutput {
    return {
      type: 'response',
      content: this.cleanup(data)
    };
  }

  private cleanup(text: string): string {
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/^\s+|\s+$/g, '');
    text = text.replace(/\t/g, '  ');
    return text;
  }
}
