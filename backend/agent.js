import OpenAI from 'openai';
import { eventBus } from './messageQueue.js';
import { MCPClient } from './mcpClient.js';

export class Agent {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.role = config.role;
    this.systemPrompt = config.systemPrompt;
    this.model = config.model || 'openai/gpt-4-turbo-preview';
    this.mcpServers = [];
    this.tools = [];

    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Agent-to-Agent System'
      }
    });
  }

  async initializeMCPServers(mcpConfigs) {
    for (const config of mcpConfigs) {
      try {
        const mcpClient = new MCPClient(config);
        await mcpClient.connect();
        this.mcpServers.push(mcpClient);

        const tools = mcpClient.getTools();
        this.tools.push(...tools);

        eventBus.publish({
          type: 'agent_mcp_connected',
          agentId: this.id,
          agentName: this.name,
          mcpServer: config.name,
          toolsCount: tools.length
        });
      } catch (error) {
        eventBus.publish({
          type: 'agent_mcp_error',
          agentId: this.id,
          agentName: this.name,
          error: error.message
        });
      }
    }
  }

  async askClarification(question, context) {
    eventBus.publish({
      type: 'agent_question',
      agentId: this.id,
      agentName: this.name,
      question,
      context
    });

    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.type === 'agent_answer' && event.agentId === this.id) {
          eventBus.off('event', handler);
          resolve(event.answer);
        }
      };
      eventBus.on('event', handler);
    });
  }

  async execute(task, context = {}) {
    eventBus.publish({
      type: 'agent_started',
      agentId: this.id,
      agentName: this.name,
      task: task.description || task
    });

    try {
      const messages = [
        {
          role: 'system',
          content: this.systemPrompt
        },
        {
          role: 'user',
          content: typeof task === 'string' ? task : JSON.stringify(task)
        }
      ];

      if (context && Object.keys(context).length > 0) {
        messages.push({
          role: 'system',
          content: `Additional context: ${JSON.stringify(context)}`
        });
      }

      const toolDefinitions = this.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema || {}
        }
      }));

      eventBus.publish({
        type: 'agent_thinking',
        agentId: this.id,
        agentName: this.name,
        availableTools: toolDefinitions.length
      });

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
        tool_choice: toolDefinitions.length > 0 ? 'auto' : undefined
      });

      const response = completion.choices[0].message;

      if (response.tool_calls) {
        eventBus.publish({
          type: 'agent_tool_calls',
          agentId: this.id,
          agentName: this.name,
          toolCalls: response.tool_calls.map(tc => tc.function.name)
        });

        for (const toolCall of response.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);

          const mcpServer = this.mcpServers.find(server =>
            server.getTools().some(t => t.name === toolName)
          );

          if (mcpServer) {
            const result = await mcpServer.callTool(toolName, toolArgs);
            messages.push({
              role: 'function',
              name: toolName,
              content: JSON.stringify(result)
            });
          }
        }

        const finalCompletion = await this.client.chat.completions.create({
          model: this.model,
          messages
        });

        response.content = finalCompletion.choices[0].message.content;
      }

      eventBus.publish({
        type: 'agent_completed',
        agentId: this.id,
        agentName: this.name,
        result: response.content
      });

      return {
        success: true,
        result: response.content,
        agentId: this.id,
        agentName: this.name
      };

    } catch (error) {
      eventBus.publish({
        type: 'agent_error',
        agentId: this.id,
        agentName: this.name,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        agentId: this.id,
        agentName: this.name
      };
    }
  }

  cleanup() {
    for (const mcpServer of this.mcpServers) {
      mcpServer.disconnect();
    }
  }
}
