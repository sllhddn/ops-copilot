import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class CreateDocumentDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(20) @MaxLength(200_000) content!: string;
  @IsOptional() @IsString() @MaxLength(300) source?: string;
}

export class AskDto {
  @IsString() @MinLength(3) @MaxLength(1000) question!: string;
  @IsOptional() @IsInt() @Min(1) @Max(10) k?: number;
}

export class HistoryMessageDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(8000) content!: string;
}

export class AgentChatDto {
  @IsString() @MinLength(2) @MaxLength(2000) message!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => HistoryMessageDto)
  history?: HistoryMessageDto[];
}

export class CreateIncidentDto {
  @Matches(/^INC-\d{1,8}$/i) ref!: string;
  @IsString() @MinLength(5) @MaxLength(200) title!: string;
  @IsString() @MinLength(2) @MaxLength(100) service!: string;
  @IsIn(['P1', 'P2', 'P3', 'P4']) severity!: 'P1' | 'P2' | 'P3' | 'P4';
  @IsOptional() @IsString() @MaxLength(4000) summary?: string;
}

export class DecideDto {
  @IsString() @MinLength(2) @MaxLength(100) reviewer!: string;
}
