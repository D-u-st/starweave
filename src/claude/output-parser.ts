export interface ParsedOutput {
  type: 'response' | 'error';
  content: string;
}

export class OutputParser {
  parse(data: string): ParsedOutput {
    if (this.isError(data)) {
      return {
        type: 'error',
        content: this.extractError(data)
      };
    }

    return {
      type: 'response',
      content: this.formatResponse(data)
    };
  }

  private isError(data: string): boolean {
    return data.includes('Error:') ||
           data.includes('error:') ||
           data.includes('Failed') ||
           data.includes('Exception');
  }

  private extractError(data: string): string {
    const errorMatch = data.match(/(?:Error|error|Failed|Exception)[:\s]*(.*)/);
    return errorMatch ? errorMatch[1].trim() : data;
  }

  private formatResponse(data: string): string {
    let formatted = data;
    formatted = this.detectAndFormatCodeBlocks(formatted);
    formatted = this.cleanupFormatting(formatted);
    return formatted;
  }

  private detectAndFormatCodeBlocks(text: string): string {
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    return text.replace(codeBlockRegex, (_match, lang, code) => {
      const language = lang || 'plaintext';
      return `\n\`\`\`${language}\n${code.trim()}\n\`\`\`\n`;
    });
  }

  private cleanupFormatting(text: string): string {
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/^\s+|\s+$/g, '');
    text = text.replace(/\t/g, '  ');
    return text;
  }
}
