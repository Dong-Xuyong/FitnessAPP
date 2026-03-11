"use client";

import { useState } from "react";
import { StudentNavigation } from "@/components/StudentNavigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Phone, Video, Info } from "lucide-react";

const initialMessages = [
  { id: 1, sender: "coach", text: "Hey Alex! How are the squats feeling today?", time: "10:30 AM" },
  { id: 2, sender: "student", text: "Much better, John. The cue to keep my chest up really helped.", time: "10:35 AM" },
  { id: 3, sender: "coach", text: "Excellent. Let's try to add another 2.5kg to the bar next session if you're feeling strong.", time: "10:40 AM" },
  { id: 4, sender: "coach", text: "Also, make sure you're hitting your protein goal this weekend. Consistency in recovery is key!", time: "10:41 AM" },
];

export default function StudentMessagesPage() {
  const [messages, setMessages] = useState(initialMessages);
  const [inputValue, setInputValue] = useState("");

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    const newMessage = {
      id: messages.length + 1,
      sender: "student",
      text: inputValue,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    
    setMessages([...messages, newMessage]);
    setInputValue("");
  };

  return (
    <StudentNavigation>
      <div className="h-[calc(100vh-160px)] flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold font-headline">Messages</h1>
            <p className="text-muted-foreground">Direct contact with your coach, John Doe.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon">
              <Phone className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Video className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <Card className="flex-1 flex flex-col overflow-hidden border-2">
          <CardHeader className="border-b bg-muted/30 py-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 ring-2 ring-primary/20">
                <AvatarImage src="https://picsum.photos/seed/trainer1/100/100" />
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-base">Coach John Doe</CardTitle>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs text-muted-foreground">Online</span>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 p-0">
            <ScrollArea className="h-full p-6">
              <div className="space-y-6">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col max-w-[80%] gap-1",
                      msg.sender === "student" ? "ml-auto items-end" : "mr-auto items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "px-4 py-3 rounded-2xl text-sm",
                        msg.sender === "student"
                          ? "bg-primary text-primary-foreground rounded-br-none"
                          : "bg-muted text-foreground rounded-bl-none"
                      )}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-muted-foreground px-1">{msg.time}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>

          <CardFooter className="p-4 border-t bg-card">
            <form
              className="flex w-full items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <Input
                placeholder="Type your message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" size="icon" className="bg-primary hover:bg-primary/90">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </StudentNavigation>
  );
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(" ");
}
