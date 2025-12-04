import { spawn } from 'child_process';

export class MCPClient {
  constructor(serverConfig) {
    this.serverConfig = serverConfig;
    this.process = null;
    this.tools = [];
    this.isConnected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.serverConfig.command, this.serverConfig.args || [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...this.serverConfig.env }
        });

        this.process.stdout.on('data', (data) => {
          try {
            const response = JSON.parse(data.toString());
            if (response.tools) {
              this.tools = response.tools;
            }
          } catch (e) {
            // Not JSON, ignore
          }
        });

        this.process.on('error', (error) => {
          reject(error);
        });

        setTimeout(() => {
          this.isConnected = true;
          this.tools = this.serverConfig.tools || [];
          resolve();
        }, 100);
      } catch (error) {
        reject(error);
      }
    });
  }

  async callTool(toolName, args) {
    if (!this.isConnected) {
      throw new Error('MCP server not connected');
    }

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    return new Promise((resolve, reject) => {
      if (this.process && this.process.stdin) {
        this.process.stdin.write(JSON.stringify(request) + '\n');

        const handler = (data) => {
          try {
            const response = JSON.parse(data.toString());
            if (response.id === request.id) {
              this.process.stdout.removeListener('data', handler);
              resolve(response.result);
            }
          } catch (e) {
            // Continue waiting
          }
        };

        this.process.stdout.on('data', handler);

        setTimeout(() => {
          this.process.stdout.removeListener('data', handler);
          reject(new Error('MCP tool call timeout'));
        }, 30000);
      } else {
        reject(new Error('MCP process not available'));
      }
    });
  }

  getTools() {
    return this.tools;
  }

  disconnect() {
    if (this.process) {
      this.process.kill();
      this.isConnected = false;
    }
  }
}
