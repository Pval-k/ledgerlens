import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'new password must be at least 8 characters' })
  newPassword!: string;

  @IsString()
  @MinLength(8, { message: 'password confirmation must be at least 8 characters' })
  newPasswordConfirm!: string;
}
